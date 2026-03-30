"""
Stage 0 Task 3: Buyer Profile Builder
Connects to MongoDB standard_port_data (5.1M records), aggregates by
BUYER_NAME + COUNTRY_CODE, computes buyer profiles with tiering.
"""

import os
import re
import time
import logging
from datetime import datetime
from pymongo import MongoClient, UpdateOne
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [BuyerProfileBuilder] %(levelname)s: %(message)s'
)
log = logging.getLogger(__name__)

MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017')
DB_NAME = 'common-service'
SOURCE_COLLECTION = 'standard_port_data'
TARGET_COLLECTION = 'buyer_profiles'
BATCH_SIZE = 10_000

STRIP_SUFFIXES = re.compile(
    r'\b(ltd|llc|inc|gmbh|pvt|private|limited|co|corp|corporation|sa|srl|ag|plc)\b',
    re.IGNORECASE
)


def normalize_name(name: str) -> str:
    """Lowercase, strip common suffixes, trim whitespace."""
    if not name:
        return ''
    cleaned = STRIP_SUFFIXES.sub('', name.lower())
    cleaned = re.sub(r'[.,\-]+', ' ', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned


def compute_tier(total_usd: float) -> str:
    if total_usd > 1_000_000:
        return 'platinum'
    elif total_usd > 100_000:
        return 'gold'
    elif total_usd > 10_000:
        return 'silver'
    return 'bronze'


def tier_to_model(tier: str) -> str:
    if tier in ('platinum', 'gold'):
        return 'premium'
    elif tier == 'silver':
        return 'mid'
    return 'local'


def build_aggregation_pipeline():
    return [
        {
            '$group': {
                '_id': {
                    'buyer': '$BUYER_NAME',
                    'country': '$COUNTRY_CODE'
                },
                'hs_codes': {'$addToSet': '$HS_CODE'},
                'product_descriptions': {'$addToSet': '$PRODUCT_DESCRIPTION'},
                'total_value_usd': {'$sum': '$TOTAL_VALUE_USD'},
                'total_quantity': {'$sum': '$TOTAL_QUANTITY'},
                'trade_count': {'$sum': 1},
                'first_trade_date': {'$min': '$EXPORT_DATE'},
                'last_trade_date': {'$max': '$EXPORT_DATE'},
                'ports_used': {'$addToSet': '$FOREIGN_PORT'},
                'indian_suppliers': {'$addToSet': '$EXPORTER_NAME'},
                'buyer_addresses': {'$addToSet': '$BUYER_ADDRESS'},
                'supplier_counts': {'$push': '$EXPORTER_NAME'},
            }
        },
        {
            '$match': {
                '_id.buyer': {'$ne': None, '$ne': ''}
            }
        }
    ]


def extract_product_keywords(descriptions: list) -> list:
    """Extract meaningful product category keywords from descriptions."""
    keywords = set()
    for desc in descriptions:
        if not desc:
            continue
        words = re.findall(r'[a-zA-Z]{4,}', desc.lower())
        stopwords = {
            'that', 'this', 'with', 'from', 'have', 'been', 'were', 'they',
            'their', 'which', 'other', 'made', 'used', 'type', 'each', 'item',
            'items', 'total', 'quantity', 'unit', 'units', 'description', 'product'
        }
        for w in words:
            if w not in stopwords:
                keywords.add(w)
    return list(keywords)[:20]


def find_top_supplier(supplier_list: list) -> str:
    """Find most frequent supplier from the raw list."""
    if not supplier_list:
        return ''
    from collections import Counter
    counts = Counter(supplier_list)
    return counts.most_common(1)[0][0] if counts else ''


def compute_frequency(first_date, last_date, trade_count: int) -> float:
    """Compute trades per month."""
    if not first_date or not last_date:
        return 0.0
    if isinstance(first_date, str):
        try:
            first_date = datetime.fromisoformat(first_date)
        except (ValueError, TypeError):
            return 0.0
    if isinstance(last_date, str):
        try:
            last_date = datetime.fromisoformat(last_date)
        except (ValueError, TypeError):
            return 0.0
    diff_days = (last_date - first_date).days
    if diff_days <= 0:
        return float(trade_count)
    months = diff_days / 30.44
    return round(trade_count / max(months, 1), 2)


def run():
    start_time = time.time()
    log.info('Connecting to MongoDB: %s', MONGODB_URI)
    client = MongoClient(MONGODB_URI)
    db = client[DB_NAME]
    source = db[SOURCE_COLLECTION]
    target = db[TARGET_COLLECTION]

    total_source = source.estimated_document_count()
    log.info('Source collection has ~%d documents', total_source)

    log.info('Running aggregation pipeline...')
    pipeline = build_aggregation_pipeline()
    pipeline.append({'$sort': {'_id.buyer': 1}})

    cursor = source.aggregate(pipeline, allowDiskUse=True, batchSize=BATCH_SIZE)

    profiles_created = 0
    tier_dist = {'platinum': 0, 'gold': 0, 'silver': 0, 'bronze': 0}
    batch_ops = []

    for doc in cursor:
        buyer_name = doc['_id'].get('buyer', '')
        country_code = doc['_id'].get('country', '')

        if not buyer_name:
            continue

        total_val = doc.get('total_value_usd', 0) or 0
        total_qty = doc.get('total_quantity', 0) or 0
        avg_price = (total_val / total_qty) if total_qty > 0 else 0
        tier = compute_tier(total_val)
        model_tier = tier_to_model(tier)

        profile = {
            'normalized_name': normalize_name(buyer_name),
            'buyer_name': buyer_name,
            'country': country_code,
            'hs_codes': [str(h) for h in (doc.get('hs_codes') or []) if h],
            'product_categories': extract_product_keywords(
                doc.get('product_descriptions') or []
            ),
            'total_trade_volume_usd': round(total_val, 2),
            'total_quantity': round(total_qty, 2),
            'avg_unit_price_usd': round(avg_price, 2),
            'trade_count': doc.get('trade_count', 0),
            'first_trade_date': doc.get('first_trade_date'),
            'last_trade_date': doc.get('last_trade_date'),
            'trade_frequency_per_month': compute_frequency(
                doc.get('first_trade_date'),
                doc.get('last_trade_date'),
                doc.get('trade_count', 0)
            ),
            'ports_used': [p for p in (doc.get('ports_used') or []) if p],
            'indian_suppliers': [s for s in (doc.get('indian_suppliers') or []) if s],
            'top_supplier': find_top_supplier(doc.get('supplier_counts') or []),
            'buyer_addresses': [a for a in (doc.get('buyer_addresses') or []) if a],
            'buyer_tier': tier,
            'communication_model_tier': model_tier,
            'last_updated': datetime.utcnow(),
        }

        batch_ops.append(
            UpdateOne(
                {'normalized_name': profile['normalized_name'], 'country': country_code},
                {'$set': profile},
                upsert=True
            )
        )

        tier_dist[tier] += 1
        profiles_created += 1

        if len(batch_ops) >= BATCH_SIZE:
            target.bulk_write(batch_ops, ordered=False)
            log.info('Processed %d profiles so far...', profiles_created)
            batch_ops = []

    if batch_ops:
        target.bulk_write(batch_ops, ordered=False)

    log.info('Creating indexes...')
    target.create_index('normalized_name')
    target.create_index('country')
    target.create_index('hs_codes')
    target.create_index('buyer_tier')
    target.create_index('communication_model_tier')
    target.create_index('last_trade_date')
    target.create_index([('normalized_name', 1), ('country', 1)], unique=True)

    elapsed = round(time.time() - start_time, 2)
    log.info('=== BUYER PROFILE BUILD COMPLETE ===')
    log.info('Source records: ~%d', total_source)
    log.info('Profiles created/updated: %d', profiles_created)
    log.info('Tier distribution: %s', tier_dist)
    log.info('Elapsed time: %ss', elapsed)

    client.close()
    return {
        'profiles_created': profiles_created,
        'tier_distribution': tier_dist,
        'elapsed_seconds': elapsed
    }


if __name__ == '__main__':
    run()
