"""
Stage 1 Task 1: Embedding Pipeline
Reads from buyer_profiles, product_catalog, customs_intelligence.
Generates BGE-M3 embeddings and upserts into Qdrant collections.
GPU: RTX 3070 Ti 8GB. Do NOT run Ollama while embedding.
"""

import os
import time
import uuid
import logging
from datetime import datetime
from pymongo import MongoClient
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    PayloadSchemaType, TextIndexParams, TokenizerType
)
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [EmbeddingPipeline] %(levelname)s: %(message)s'
)
log = logging.getLogger(__name__)

MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017')
QDRANT_URL = os.getenv('QDRANT_URL', 'http://localhost:6333')
DB_NAME = 'common-service'
BATCH_SIZE = 256
EMBEDDING_DIM = 1024
MODEL_NAME = 'BAAI/bge-m3'


def create_qdrant_collections(qdrant: QdrantClient):
    """Create Qdrant collections with proper schema."""
    collections = {
        'buyers': {
            'country': PayloadSchemaType.KEYWORD,
            'hs_codes': PayloadSchemaType.KEYWORD,
            'buyer_tier': PayloadSchemaType.KEYWORD,
            'communication_model_tier': PayloadSchemaType.KEYWORD,
            'total_trade_volume_usd': PayloadSchemaType.FLOAT,
            'trade_count': PayloadSchemaType.INTEGER,
        },
        'products': {
            'hs_code': PayloadSchemaType.KEYWORD,
            'category': PayloadSchemaType.KEYWORD,
            'seller_location': PayloadSchemaType.KEYWORD,
        },
        'customs': {
            'hs_code': PayloadSchemaType.KEYWORD,
            'country': PayloadSchemaType.KEYWORD,
            'data_confidence': PayloadSchemaType.FLOAT,
        },
    }

    for col_name, indexes in collections.items():
        try:
            qdrant.get_collection(col_name)
            log.info('Collection "%s" already exists', col_name)
        except Exception:
            qdrant.create_collection(
                collection_name=col_name,
                vectors_config=VectorParams(
                    size=EMBEDDING_DIM,
                    distance=Distance.COSINE
                )
            )
            log.info('Created collection "%s"', col_name)

        for field_name, field_type in indexes.items():
            try:
                qdrant.create_payload_index(
                    collection_name=col_name,
                    field_name=field_name,
                    field_schema=field_type
                )
            except Exception:
                pass


def buyer_to_text(doc: dict) -> str:
    name = doc.get('buyer_name', '')
    country = doc.get('country', '')
    products = ', '.join(doc.get('product_categories', [])[:5])
    ports = ', '.join(doc.get('ports_used', [])[:3])
    value = doc.get('total_trade_volume_usd', 0)
    return f"{name} in {country} imports {products} via {ports}. Volume: ${value:,.0f}."


def product_to_text(doc: dict) -> str:
    name = doc.get('product_name', '')
    desc = doc.get('description', '')[:200]
    hs = doc.get('hs_code', '')
    seller = doc.get('seller_name', '')
    loc = doc.get('seller_location', '')
    return f"{name} - {desc}. HS:{hs}. Seller:{seller} in {loc}."


def customs_to_text(doc: dict) -> str:
    hs = doc.get('hs_code', '')
    country = doc.get('country', '')
    rate = doc.get('import_duty_rate', 0)
    certs = ', '.join(doc.get('required_certifications', [])[:5])
    return f"Importing HS {hs} into {country}: duty {rate}%, requires {certs}."


def embed_collection(
    model: SentenceTransformer,
    qdrant: QdrantClient,
    mongo_col,
    qdrant_col_name: str,
    text_fn,
    payload_fn,
):
    """Embed documents from a MongoDB collection into Qdrant."""
    total = mongo_col.estimated_document_count()
    log.info('Embedding %s: ~%d documents', qdrant_col_name, total)

    batch_texts = []
    batch_payloads = []
    batch_ids = []
    embedded = 0
    start = time.time()

    for doc in mongo_col.find({}, batch_size=BATCH_SIZE):
        text = text_fn(doc)
        if not text.strip():
            continue

        batch_texts.append(text)
        batch_payloads.append(payload_fn(doc))
        batch_ids.append(str(uuid.uuid4()))

        if len(batch_texts) >= BATCH_SIZE:
            batch_start = time.time()
            embeddings = model.encode(batch_texts, normalize_embeddings=True)

            points = [
                PointStruct(
                    id=batch_ids[i],
                    vector=embeddings[i].tolist(),
                    payload=batch_payloads[i]
                )
                for i in range(len(batch_texts))
            ]

            qdrant.upsert(collection_name=qdrant_col_name, points=points)

            embedded += len(batch_texts)
            batch_time = round(time.time() - batch_start, 2)
            log.info('  %s: %d/%d embedded (batch: %ss)',
                     qdrant_col_name, embedded, total, batch_time)

            batch_texts = []
            batch_payloads = []
            batch_ids = []

    if batch_texts:
        embeddings = model.encode(batch_texts, normalize_embeddings=True)
        points = [
            PointStruct(
                id=batch_ids[i],
                vector=embeddings[i].tolist(),
                payload=batch_payloads[i]
            )
            for i in range(len(batch_texts))
        ]
        qdrant.upsert(collection_name=qdrant_col_name, points=points)
        embedded += len(batch_texts)

    elapsed = round(time.time() - start, 2)
    count = qdrant.get_collection(qdrant_col_name).points_count
    log.info('  %s: DONE. %d embedded, %d points in Qdrant, %ss',
             qdrant_col_name, embedded, count, elapsed)
    return embedded


def run():
    total_start = time.time()

    log.info('Loading BGE-M3 model (%s)...', MODEL_NAME)
    model = SentenceTransformer(MODEL_NAME)
    log.info('Model loaded.')

    log.info('Connecting to MongoDB: %s', MONGODB_URI)
    mongo = MongoClient(MONGODB_URI)
    db = mongo[DB_NAME]

    log.info('Connecting to Qdrant: %s', QDRANT_URL)
    qdrant = QdrantClient(url=QDRANT_URL)

    create_qdrant_collections(qdrant)

    results = {}

    # Embed buyers
    results['buyers'] = embed_collection(
        model, qdrant,
        db['buyer_profiles'], 'buyers',
        buyer_to_text,
        lambda doc: {
            'buyer_name': doc.get('buyer_name', ''),
            'normalized_name': doc.get('normalized_name', ''),
            'country': doc.get('country', ''),
            'hs_codes': doc.get('hs_codes', []),
            'buyer_tier': doc.get('buyer_tier', ''),
            'communication_model_tier': doc.get('communication_model_tier', ''),
            'total_trade_volume_usd': doc.get('total_trade_volume_usd', 0),
            'trade_count': doc.get('trade_count', 0),
            'mongo_id': str(doc.get('_id', '')),
        }
    )

    # Embed products
    results['products'] = embed_collection(
        model, qdrant,
        db['product_catalog'], 'products',
        product_to_text,
        lambda doc: {
            'product_name': doc.get('product_name', ''),
            'hs_code': doc.get('hs_code', ''),
            'category': doc.get('category', ''),
            'seller_name': doc.get('seller_name', ''),
            'seller_location': doc.get('seller_location', ''),
            'seller_verified': doc.get('seller_verified', False),
            'mongo_id': str(doc.get('_id', '')),
        }
    )

    # Embed customs
    results['customs'] = embed_collection(
        model, qdrant,
        db['customs_intelligence'], 'customs',
        customs_to_text,
        lambda doc: {
            'hs_code': doc.get('hs_code', ''),
            'country': doc.get('country', ''),
            'data_confidence': doc.get('data_confidence_score', 0),
            'import_duty_rate': doc.get('import_duty_rate', 0),
            'mongo_id': str(doc.get('_id', '')),
        }
    )

    total_elapsed = round(time.time() - total_start, 2)
    log.info('=== EMBEDDING PIPELINE COMPLETE ===')
    for col, count in results.items():
        log.info('  %s: %d documents embedded', col, count)
    log.info('Total time: %ss', total_elapsed)

    mongo.close()
    return results


if __name__ == '__main__':
    run()
