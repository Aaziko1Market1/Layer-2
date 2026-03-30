"""
Stage 0 Task 5: Customs 3.0 Intelligence Builder
Reads from macmap_regulatory, macmap_tariff, macmap_trade_remedies.
Creates unified compliance docs per HS code + country combination.
"""

import os
import time
import logging
from datetime import datetime
from pymongo import MongoClient, UpdateOne
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [CustomsIndexer] %(levelname)s: %(message)s'
)
log = logging.getLogger(__name__)

MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017')
DB_NAME = 'common-service'
TARGET_COLLECTION = 'customs_intelligence'
BATCH_SIZE = 5_000


def safe_float(val, default=0.0) -> float:
    try:
        return float(val) if val is not None else default
    except (ValueError, TypeError):
        return default


def safe_list(val) -> list:
    if isinstance(val, list):
        return [str(v).strip() for v in val if v]
    if isinstance(val, str):
        return [v.strip() for v in val.split(',') if v.strip()]
    return []


def compute_confidence(source_type: str, has_tariff: bool, has_regulatory: bool) -> float:
    """Compute data confidence score based on source completeness."""
    score = 0.5
    if has_tariff:
        score += 0.25
    if has_regulatory:
        score += 0.2
    if source_type == 'official':
        score += 0.05
    return min(score, 1.0)


def run():
    start_time = time.time()
    log.info('Connecting to MongoDB: %s', MONGODB_URI)
    client = MongoClient(MONGODB_URI)
    db = client[DB_NAME]
    target = db[TARGET_COLLECTION]

    tariff_col = db.get_collection('macmap_tariff')
    regulatory_col = db.get_collection('macmap_regulatory')
    remedies_col = db.get_collection('macmap_trade_remedies')

    tariff_count = tariff_col.estimated_document_count()
    regulatory_count = regulatory_col.estimated_document_count()
    remedies_count = remedies_col.estimated_document_count()
    log.info('Tariff records: ~%d, Regulatory: ~%d, Remedies: ~%d',
             tariff_count, regulatory_count, remedies_count)

    compliance_map = {}

    log.info('Processing tariff data...')
    for doc in tariff_col.find({}, batch_size=BATCH_SIZE):
        hs_code = str(doc.get('hs_code') or doc.get('HS_CODE') or
                      doc.get('hscode') or doc.get('product_code') or '').strip()
        country = str(doc.get('country') or doc.get('COUNTRY') or
                      doc.get('reporter') or doc.get('partner') or '').strip()

        if not hs_code or not country:
            continue

        key = f'{hs_code}|{country}'
        if key not in compliance_map:
            compliance_map[key] = {
                'hs_code': hs_code,
                'country': country,
                'import_duty_rate': 0,
                'vat_rate': 0,
                'excise_rate': 0,
                'anti_dumping_duty': 0,
                'required_certifications': [],
                'ntm_codes': [],
                'required_documents': [],
                'labeling_requirements': [],
                'special_permits': [],
                'has_tariff': False,
                'has_regulatory': False,
            }

        entry = compliance_map[key]
        entry['import_duty_rate'] = safe_float(
            doc.get('duty_rate') or doc.get('tariff_rate') or
            doc.get('applied_rate') or doc.get('mfn_rate'), 0
        )
        entry['vat_rate'] = safe_float(doc.get('vat_rate') or doc.get('vat'), 0)
        entry['excise_rate'] = safe_float(doc.get('excise_rate') or doc.get('excise'), 0)
        entry['has_tariff'] = True

    log.info('Processing regulatory data...')
    for doc in regulatory_col.find({}, batch_size=BATCH_SIZE):
        hs_code = str(doc.get('hs_code') or doc.get('HS_CODE') or
                      doc.get('hscode') or doc.get('product_code') or '').strip()
        country = str(doc.get('country') or doc.get('COUNTRY') or
                      doc.get('reporter') or '').strip()

        if not hs_code or not country:
            continue

        key = f'{hs_code}|{country}'
        if key not in compliance_map:
            compliance_map[key] = {
                'hs_code': hs_code,
                'country': country,
                'import_duty_rate': 0,
                'vat_rate': 0,
                'excise_rate': 0,
                'anti_dumping_duty': 0,
                'required_certifications': [],
                'ntm_codes': [],
                'required_documents': [],
                'labeling_requirements': [],
                'special_permits': [],
                'has_tariff': False,
                'has_regulatory': False,
            }

        entry = compliance_map[key]
        entry['required_certifications'] = list(set(
            entry['required_certifications'] +
            safe_list(doc.get('certifications') or doc.get('required_certifications'))
        ))
        entry['ntm_codes'] = list(set(
            entry['ntm_codes'] +
            safe_list(doc.get('ntm_codes') or doc.get('ntm_code') or doc.get('measure_code'))
        ))
        entry['required_documents'] = list(set(
            entry['required_documents'] +
            safe_list(doc.get('required_documents') or doc.get('documents'))
        ))
        entry['labeling_requirements'] = list(set(
            entry['labeling_requirements'] +
            safe_list(doc.get('labeling_requirements') or doc.get('labeling'))
        ))
        entry['special_permits'] = list(set(
            entry['special_permits'] +
            safe_list(doc.get('special_permits') or doc.get('permits') or doc.get('licenses'))
        ))
        entry['has_regulatory'] = True

    log.info('Processing trade remedies...')
    for doc in remedies_col.find({}, batch_size=BATCH_SIZE):
        hs_code = str(doc.get('hs_code') or doc.get('HS_CODE') or
                      doc.get('product_code') or '').strip()
        country = str(doc.get('country') or doc.get('COUNTRY') or
                      doc.get('imposing_country') or '').strip()

        if not hs_code or not country:
            continue

        key = f'{hs_code}|{country}'
        if key in compliance_map:
            compliance_map[key]['anti_dumping_duty'] = safe_float(
                doc.get('anti_dumping_duty') or doc.get('duty_rate') or
                doc.get('ad_rate'), 0
            )

    log.info('Writing %d compliance records...', len(compliance_map))
    batch_ops = []
    for key, entry in compliance_map.items():
        confidence = compute_confidence(
            'official',
            entry.pop('has_tariff', False),
            entry.pop('has_regulatory', False),
        )
        entry['data_confidence_score'] = round(confidence, 2)
        entry['last_updated'] = datetime.utcnow()

        batch_ops.append(
            UpdateOne(
                {'hs_code': entry['hs_code'], 'country': entry['country']},
                {'$set': entry},
                upsert=True
            )
        )

        if len(batch_ops) >= BATCH_SIZE:
            target.bulk_write(batch_ops, ordered=False)
            log.info('Written %d records...', len(batch_ops))
            batch_ops = []

    if batch_ops:
        target.bulk_write(batch_ops, ordered=False)

    log.info('Creating indexes...')
    target.create_index([('hs_code', 1), ('country', 1)], unique=True)
    target.create_index('hs_code')
    target.create_index('country')
    target.create_index('data_confidence_score')

    elapsed = round(time.time() - start_time, 2)
    log.info('=== CUSTOMS INTELLIGENCE BUILD COMPLETE ===')
    log.info('Compliance records created: %d', len(compliance_map))
    log.info('Elapsed time: %ss', elapsed)

    client.close()
    return {
        'compliance_records': len(compliance_map),
        'elapsed_seconds': elapsed,
    }


if __name__ == '__main__':
    run()
