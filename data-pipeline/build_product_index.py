"""
Stage 0 Task 4: Product Catalog Indexer
Reads from new_scrapper collections (Aaziko marketplace product data),
creates unified product documents in common-service.product_catalog.
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
    format='%(asctime)s [ProductIndexer] %(levelname)s: %(message)s'
)
log = logging.getLogger(__name__)

MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017')
DB_NAME = 'common-service'
TARGET_COLLECTION = 'product_catalog'
BATCH_SIZE = 5_000

SCRAPPER_COLLECTIONS = [
    'new_scrapper_products',
    'new_scrapper_suppliers',
    'new_scrapper_listings',
]


def extract_hs_code(text: str) -> str:
    """Try to extract HS code from text."""
    if not text:
        return ''
    match = re.search(r'\b(\d{4,8})\b', str(text))
    return match.group(1) if match else ''


def extract_price_range(price_data) -> dict:
    """Normalize price data into {min, max} USD range."""
    if isinstance(price_data, dict):
        return {
            'min': float(price_data.get('min', 0) or 0),
            'max': float(price_data.get('max', 0) or 0),
        }
    if isinstance(price_data, (int, float)):
        val = float(price_data)
        return {'min': val, 'max': val}
    if isinstance(price_data, str):
        numbers = re.findall(r'[\d.]+', price_data)
        if len(numbers) >= 2:
            return {'min': float(numbers[0]), 'max': float(numbers[1])}
        elif len(numbers) == 1:
            val = float(numbers[0])
            return {'min': val, 'max': val}
    return {'min': 0, 'max': 0}


def normalize_product(doc: dict) -> dict:
    """Transform a raw scrapper document into a unified product document."""
    product_name = (
        doc.get('product_name') or
        doc.get('name') or
        doc.get('title') or
        doc.get('productName') or
        ''
    )
    category = (
        doc.get('category') or
        doc.get('product_category') or
        doc.get('categoryName') or
        ''
    )
    hs_code = (
        doc.get('hs_code') or
        doc.get('hsCode') or
        doc.get('HS_CODE') or
        extract_hs_code(doc.get('product_description', ''))
    )
    seller_name = (
        doc.get('seller_name') or
        doc.get('supplier_name') or
        doc.get('company_name') or
        doc.get('sellerName') or
        ''
    )
    seller_location = (
        doc.get('seller_location') or
        doc.get('location') or
        doc.get('city') or
        doc.get('state') or
        ''
    )
    seller_verified = bool(
        doc.get('seller_verified') or
        doc.get('verified') or
        doc.get('is_verified') or
        False
    )
    price_range = extract_price_range(
        doc.get('price_range_usd') or
        doc.get('price') or
        doc.get('price_range') or
        doc.get('unitPrice') or
        0
    )
    moq = int(doc.get('moq') or doc.get('min_order_qty') or doc.get('MOQ') or 0)
    certifications = doc.get('certifications') or doc.get('certificates') or []
    if isinstance(certifications, str):
        certifications = [c.strip() for c in certifications.split(',') if c.strip()]
    description = (
        doc.get('description') or
        doc.get('product_description') or
        doc.get('details') or
        ''
    )

    return {
        'product_name': str(product_name).strip(),
        'category': str(category).strip(),
        'hs_code': str(hs_code).strip(),
        'seller_name': str(seller_name).strip(),
        'seller_location': str(seller_location).strip(),
        'seller_verified': seller_verified,
        'price_range_usd': price_range,
        'moq': moq,
        'certifications': certifications,
        'description': str(description).strip()[:500],
        'last_updated': datetime.utcnow(),
    }


def run():
    start_time = time.time()
    log.info('Connecting to MongoDB: %s', MONGODB_URI)
    client = MongoClient(MONGODB_URI)
    db = client[DB_NAME]
    target = db[TARGET_COLLECTION]

    total_processed = 0
    total_products = 0
    batch_ops = []

    all_collections = db.list_collection_names()
    scrapper_cols = [c for c in all_collections if 'scrapper' in c.lower() or 'scrap' in c.lower()]
    if not scrapper_cols:
        scrapper_cols = [c for c in SCRAPPER_COLLECTIONS if c in all_collections]

    log.info('Found scrapper collections: %s', scrapper_cols)

    for col_name in scrapper_cols:
        col = db[col_name]
        count = col.estimated_document_count()
        log.info('Processing collection: %s (~%d docs)', col_name, count)

        for doc in col.find({}, batch_size=BATCH_SIZE):
            total_processed += 1
            product = normalize_product(doc)

            if not product['product_name']:
                continue

            batch_ops.append(
                UpdateOne(
                    {
                        'product_name': product['product_name'],
                        'seller_name': product['seller_name'],
                    },
                    {'$set': product},
                    upsert=True
                )
            )
            total_products += 1

            if len(batch_ops) >= BATCH_SIZE:
                target.bulk_write(batch_ops, ordered=False)
                log.info('Processed %d products from %d docs...', total_products, total_processed)
                batch_ops = []

    if batch_ops:
        target.bulk_write(batch_ops, ordered=False)

    log.info('Creating indexes...')
    target.create_index('hs_code')
    target.create_index('category')
    target.create_index('seller_location')
    target.create_index('seller_name')
    target.create_index([('product_name', 'text'), ('description', 'text')])

    elapsed = round(time.time() - start_time, 2)
    log.info('=== PRODUCT CATALOG BUILD COMPLETE ===')
    log.info('Documents processed: %d', total_processed)
    log.info('Products indexed: %d', total_products)
    log.info('Elapsed time: %ss', elapsed)

    client.close()
    return {
        'docs_processed': total_processed,
        'products_indexed': total_products,
        'elapsed_seconds': elapsed,
    }


if __name__ == '__main__':
    run()
