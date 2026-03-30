// ─── AAZIKO BUSINESS DATA ────────────────────────────────────────────────────
// This is the ground-truth data Arjun uses to answer buyer questions.
// Update this file with real supplier/product/pricing data from your catalog.

export const AAZIKO_DATA = {

  company: {
    name: 'Aaziko.com',
    tagline: "India's verified B2B export platform",
    established: 2019,
    verified_suppliers: 4800,
    countries_served: 62,
    total_exports_usd: '$480M+',
    certifications: ['ISO 9001', 'FIEO Member', 'DGFT Registered'],
    support_email: 'trade@aaziko.com',
    support_whatsapp: '+91-98765-00000',
  },

  // ── PRODUCT CATEGORIES ────────────────────────────────────────────────────
  products: [
    {
      category: 'Cotton T-Shirts',
      hs_code: '6109.10',
      variants: ['Round neck', 'V-neck', 'Polo', 'Henley'],
      gsm_options: [140, 160, 180, 200, 220],
      fabric_options: ['100% Cotton', '95% Cotton 5% Elastane', 'CVC (60/40)', 'Pique Cotton'],
      moq_pieces: 500,
      bulk_moq_pieces: 5000,
      price_range_fob_usd: { min: 2.80, max: 5.50 },
      price_tiers: [
        { qty: '500-2000',  price_fob: '$4.20–5.50' },
        { qty: '2001-5000', price_fob: '$3.40–4.20' },
        { qty: '5001-15000',price_fob: '$2.80–3.40' },
        { qty: '15000+',    price_fob: '$2.40–2.80' },
      ],
      certifications_available: ['GOTS', 'OEKO-TEX Standard 100', 'BCI', 'Fair Trade'],
      lead_time_days: { sample: '7-10', bulk: '25-35' },
      customization: ['Custom neck label', 'Screen print', 'Embroidery', 'Sublimation', 'Swing tags', 'Polybag packing'],
      top_manufacturing_cities: ['Tirupur', 'Ludhiana', 'Surat'],
    },
    {
      category: 'Denim Jeans',
      hs_code: '6203.42',
      variants: ['Slim fit', 'Regular fit', 'Bootcut', 'Skinny'],
      fabric_options: ['100% Denim', 'Stretch Denim (2% Lycra)', 'Raw Denim'],
      moq_pieces: 300,
      bulk_moq_pieces: 3000,
      price_range_fob_usd: { min: 6.50, max: 14.00 },
      price_tiers: [
        { qty: '300-1000',  price_fob: '$10.50–14.00' },
        { qty: '1001-3000', price_fob: '$8.00–10.50' },
        { qty: '3001+',     price_fob: '$6.50–8.00' },
      ],
      certifications_available: ['OEKO-TEX Standard 100', 'GOTS (organic denim)'],
      lead_time_days: { sample: '10-14', bulk: '30-45' },
      customization: ['Custom patch', 'Laser wash', 'Stone wash', 'Custom rivets', 'Private label'],
      top_manufacturing_cities: ['Ahmedabad', 'Mumbai'],
    },
    {
      category: 'Casual Shirts',
      hs_code: '6205.20',
      variants: ['Oxford', 'Poplin', 'Chambray', 'Linen blend'],
      moq_pieces: 300,
      bulk_moq_pieces: 2000,
      price_range_fob_usd: { min: 4.50, max: 9.00 },
      price_tiers: [
        { qty: '300-1000',  price_fob: '$7.00–9.00' },
        { qty: '1001-2000', price_fob: '$5.50–7.00' },
        { qty: '2001+',     price_fob: '$4.50–5.50' },
      ],
      certifications_available: ['OEKO-TEX Standard 100', 'BCI'],
      lead_time_days: { sample: '7-12', bulk: '28-40' },
      top_manufacturing_cities: ['Bangalore', 'Jaipur', 'Surat'],
    },
    {
      category: 'Sportswear / Activewear',
      hs_code: '6211.20',
      variants: ['Dry-fit tees', 'Track pants', 'Compression shorts', 'Sports bra'],
      fabric_options: ['Polyester', 'Nylon Spandex', 'Moisture-wicking blend'],
      moq_pieces: 500,
      bulk_moq_pieces: 3000,
      price_range_fob_usd: { min: 3.20, max: 8.50 },
      price_tiers: [
        { qty: '500-2000',  price_fob: '$5.50–8.50' },
        { qty: '2001-5000', price_fob: '$4.00–5.50' },
        { qty: '5001+',     price_fob: '$3.20–4.00' },
      ],
      certifications_available: ['OEKO-TEX', 'bluesign'],
      lead_time_days: { sample: '7-10', bulk: '25-35' },
      top_manufacturing_cities: ['Tirupur', 'Mumbai'],
    },
  ],

  // ── TOP VERIFIED SUPPLIERS ────────────────────────────────────────────────
  suppliers: [
    {
      name: 'Tirupur Textiles Pvt Ltd',
      location: 'Tirupur, Tamil Nadu',
      specialization: 'Cotton T-Shirts, Polos, Activewear',
      annual_capacity_pieces: 3000000,
      certifications: ['GOTS', 'OEKO-TEX', 'BSCI', 'WRAP'],
      min_order: 1000,
      export_countries: ['Germany', 'USA', 'France', 'Australia'],
      average_rating: 4.8,
      years_on_platform: 5,
      price_competitiveness: 'High',
      on_time_delivery_rate: '97%',
    },
    {
      name: 'Surat Garments Hub',
      location: 'Surat, Gujarat',
      specialization: 'Casual shirts, Dresses, Ethnic wear',
      annual_capacity_pieces: 2000000,
      certifications: ['OEKO-TEX', 'ISO 9001'],
      min_order: 500,
      export_countries: ['UAE', 'UK', 'Singapore'],
      average_rating: 4.6,
      years_on_platform: 4,
      price_competitiveness: 'Medium',
      on_time_delivery_rate: '94%',
    },
    {
      name: 'Ahmedabad Denim Works',
      location: 'Ahmedabad, Gujarat',
      specialization: 'Denim jeans, Jackets, Shorts',
      annual_capacity_pieces: 1500000,
      certifications: ['OEKO-TEX', 'GOTS (organic denim)', 'BSCI'],
      min_order: 300,
      export_countries: ['Italy', 'Spain', 'USA'],
      average_rating: 4.7,
      years_on_platform: 6,
      price_competitiveness: 'High',
      on_time_delivery_rate: '95%',
    },
    {
      name: 'Ludhiana Knitwear Exports',
      location: 'Ludhiana, Punjab',
      specialization: 'Woolen knitwear, Sweaters, Cardigans',
      annual_capacity_pieces: 800000,
      certifications: ['OEKO-TEX', 'woolmark'],
      min_order: 200,
      export_countries: ['Germany', 'Russia', 'Canada'],
      average_rating: 4.5,
      years_on_platform: 3,
      price_competitiveness: 'Medium',
      on_time_delivery_rate: '92%',
    },
  ],

  // ── SHIPPING & LOGISTICS ─────────────────────────────────────────────────
  shipping: {
    ports: ['Mumbai (JNPT)', 'Chennai', 'Mundra', 'Kolkata'],
    incoterms_supported: ['FOB', 'CIF', 'EXW', 'DDP', 'DAP', 'CFR'],
    sea_freight_transit: {
      'Hamburg, Germany':     '24–30 days',
      'Rotterdam, Netherlands': '22–28 days',
      'Dubai, UAE':           '10–14 days',
      'New York, USA':        '22–28 days',
      'Los Angeles, USA':     '28–35 days',
      'Singapore':            '14–18 days',
      'Sydney, Australia':    '18–24 days',
      'Felixstowe, UK':       '20–26 days',
    },
    air_freight_transit: {
      'Germany':   '3–5 days',
      'UAE':       '1–2 days',
      'USA':       '4–6 days',
      'Australia': '5–7 days',
      'UK':        '3–5 days',
    },
    documentation: ['Commercial Invoice', 'Packing List', 'Bill of Lading', 'Certificate of Origin', 'Phytosanitary (if needed)', 'GOTS/OEKO-TEX Certificate'],
    customs_agent: 'Aaziko coordinates with licensed CHAs (Customs House Agents)',
  },

  // ── PAYMENT TERMS ─────────────────────────────────────────────────────────
  payment: {
    standard_terms: '30% TT advance + 70% against BL copy',
    alternatives: [
      '50% advance + 50% before shipment',
      'LC at sight (Letter of Credit)',
      '20% advance + 80% on BL copy (for repeat buyers)',
      'D/P (Documents against Payment) for trusted buyers',
    ],
    currencies_accepted: ['USD', 'EUR', 'GBP', 'AED'],
    payment_methods: ['Wire Transfer (TT)', 'LC (Letter of Credit)', 'Trade Finance via Aaziko'],
    sample_payment: 'Full advance for samples (deductible from bulk order)',
  },

  // ── QUALITY CONTROL ───────────────────────────────────────────────────────
  quality: {
    inspection_process: [
      'Pre-production sample approval',
      'In-line quality check (during production)',
      'Pre-shipment inspection (PSI) by third party',
      'AQL 2.5 standard inspection',
    ],
    third_party_inspectors: ['SGS', 'Bureau Veritas', 'Intertek', 'QIMA'],
    inspection_cost_usd: '$180–$280 per shipment',
    defect_policy: 'Aaziko mediates disputes; replacement or credit within 30 days',
    defect_tolerance: 'AQL 2.5 (max 2.5% defect rate)',
  },

  // ── SAMPLE PROCESS ────────────────────────────────────────────────────────
  samples: {
    lead_time_days: '7–10 business days',
    cost_usd: '$40–$80 per sample (fabric + printing)',
    shipping_cost_usd: '$25–$45 via DHL Express',
    deductible_from_bulk: true,
    changes_allowed: 2,
    approval_required_before_bulk: true,
  },

  // ── CERTIFICATIONS DETAIL ─────────────────────────────────────────────────
  certifications: {
    GOTS: {
      full_name: 'Global Organic Textile Standard',
      what_it_means: 'Minimum 70% organic fibres; covers entire supply chain from fibre to final product',
      price_premium: '+15–25%',
      available_on: 'Selected cotton t-shirt and denim suppliers',
    },
    'OEKO-TEX': {
      full_name: 'OEKO-TEX Standard 100',
      what_it_means: 'Every component tested for harmful substances; safe for human skin',
      price_premium: '+8–15%',
      available_on: 'Most garment suppliers on Aaziko',
    },
    BSCI: {
      full_name: 'Business Social Compliance Initiative',
      what_it_means: 'Ethical labour practices and factory audit compliance',
      price_premium: 'No premium — included in supplier vetting',
      available_on: 'All Aaziko Platinum-tier suppliers',
    },
    WRAP: {
      full_name: 'Worldwide Responsible Accredited Production',
      what_it_means: 'Safe, lawful, humane and ethical manufacturing',
      price_premium: 'No premium',
      available_on: 'Selected suppliers',
    },
  },
};

// ─── FORMAT FOR AI CONTEXT INJECTION ─────────────────────────────────────────
export function getContextForBuyer(productCategory?: string): string {
  const p = AAZIKO_DATA.products.find(x =>
    x.category.toLowerCase().includes((productCategory || 'cotton t-shirt').toLowerCase())
  ) || AAZIKO_DATA.products[0];

  const relevantSuppliers = AAZIKO_DATA.suppliers
    .filter(s => s.specialization.toLowerCase().includes(
      (productCategory || 'cotton').toLowerCase()
    ))
    .slice(0, 2);

  return `
=== AAZIKO PLATFORM DATA (use this as ground truth — do NOT invent data) ===

PLATFORM: ${AAZIKO_DATA.company.verified_suppliers} verified suppliers | ${AAZIKO_DATA.company.countries_served} countries | ${AAZIKO_DATA.company.total_exports_usd} total exports

PRODUCT: ${p.category} (HS ${p.hs_code})
- MOQ: ${p.moq_pieces} pcs (sample), ${p.bulk_moq_pieces} pcs (bulk)
- Pricing (FOB India):
${p.price_tiers.map(t => `  • ${t.qty} pcs → ${t.price_fob}`).join('\n')}
- Lead time: Samples ${p.lead_time_days.sample} days | Bulk ${p.lead_time_days.bulk} days
- Certifications available: ${p.certifications_available?.join(', ')}
- Customization: ${p.customization?.join(', ')}

TOP VERIFIED SUPPLIERS:
${relevantSuppliers.map(s => `- ${s.name} (${s.location}): ${s.certifications.join(', ')} | Rating ${s.average_rating}/5 | On-time ${s.on_time_delivery_rate}`).join('\n')}

SHIPPING:
- Standard terms: ${AAZIKO_DATA.payment.standard_terms}
- Incoterms: ${AAZIKO_DATA.shipping.incoterms_supported.join(', ')}
- Sea freight to Hamburg: ${AAZIKO_DATA.shipping.sea_freight_transit['Hamburg, Germany']}
- Sea freight to Dubai: ${AAZIKO_DATA.shipping.sea_freight_transit['Dubai, UAE']}

PAYMENT OPTIONS:
${AAZIKO_DATA.payment.alternatives.map(a => `- ${a}`).join('\n')}

SAMPLES:
- Cost: ${AAZIKO_DATA.samples.cost_usd} + shipping ${AAZIKO_DATA.samples.shipping_cost_usd}
- Lead time: ${AAZIKO_DATA.samples.lead_time_days}
- Deductible from bulk: Yes

QUALITY:
- Inspection: ${AAZIKO_DATA.quality.inspection_process.join(' → ')}
- Standard: AQL 2.5 | Third-party: ${AAZIKO_DATA.quality.third_party_inspectors.join(', ')}
- Cost: ${AAZIKO_DATA.quality.inspection_cost_usd}

GOTS cert: ${AAZIKO_DATA.certifications.GOTS.price_premium} premium | ${AAZIKO_DATA.certifications.GOTS.what_it_means}
OEKO-TEX cert: ${AAZIKO_DATA.certifications['OEKO-TEX'].price_premium} premium | ${AAZIKO_DATA.certifications['OEKO-TEX'].what_it_means}

=== END AAZIKO DATA ===
`;
}
