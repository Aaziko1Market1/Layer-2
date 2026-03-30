"""
Stage 0 Task 6: Orchestrator Script
Runs all 3 data pipelines in sequence, logs total execution time,
and prints summary statistics per collection.
"""

import time
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [PipelineOrchestrator] %(levelname)s: %(message)s'
)
log = logging.getLogger(__name__)


def run():
    total_start = time.time()
    results = {}

    log.info('=' * 60)
    log.info('AAZIKO DATA PIPELINE - FULL RUN')
    log.info('=' * 60)

    # Pipeline 1: Buyer Profiles
    log.info('\n--- PIPELINE 1: Buyer Profiles ---')
    try:
        from build_buyer_profiles import run as build_buyers
        results['buyer_profiles'] = build_buyers()
        log.info('Buyer Profiles: SUCCESS')
    except Exception as e:
        log.error('Buyer Profiles FAILED: %s', e)
        results['buyer_profiles'] = {'error': str(e)}

    # Pipeline 2: Product Catalog
    log.info('\n--- PIPELINE 2: Product Catalog ---')
    try:
        from build_product_index import run as build_products
        results['product_catalog'] = build_products()
        log.info('Product Catalog: SUCCESS')
    except Exception as e:
        log.error('Product Catalog FAILED: %s', e)
        results['product_catalog'] = {'error': str(e)}

    # Pipeline 3: Customs Intelligence
    log.info('\n--- PIPELINE 3: Customs Intelligence ---')
    try:
        from build_customs_index import run as build_customs
        results['customs_intelligence'] = build_customs()
        log.info('Customs Intelligence: SUCCESS')
    except Exception as e:
        log.error('Customs Intelligence FAILED: %s', e)
        results['customs_intelligence'] = {'error': str(e)}

    total_elapsed = round(time.time() - total_start, 2)

    log.info('\n' + '=' * 60)
    log.info('PIPELINE SUMMARY')
    log.info('=' * 60)
    for pipeline_name, result in results.items():
        if 'error' in result:
            log.info('  %s: FAILED - %s', pipeline_name, result['error'])
        else:
            log.info('  %s: %s', pipeline_name, result)
    log.info('Total execution time: %ss', total_elapsed)
    log.info('=' * 60)

    return results


if __name__ == '__main__':
    run()
