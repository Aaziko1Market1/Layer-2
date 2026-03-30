// AAZIKO MASTER KNOWLEDGE BASE — Part 1: Identity, Modules, Journeys, Guardrails
// Full 112 Q&A loaded in parts 2 & 3

export const IDENTITY = {
  name: 'Aaziko',
  tagline: 'A New Way Of Global Trade',
  vision: 'Making Global Trade Easiest, Transparent, and Trustful for Everyone.',
  positioning: 'Cross-border B2B trade platform — trade execution infrastructure and trust layer.',
  public_statement: 'Aaziko helps Indian manufacturers and global buyers trade with more clarity, trust, and execution support.',
  differentiator: 'A plain directory stops at contact discovery. Aaziko reduces execution risk after discovery — supplier validation, order coordination, inspection workflows, documentation readiness, logistics visibility.',
  stats: { verified_suppliers: '4,800+', countries_served: '62', total_exports: '$480M+' },
};

export const MODULES = [
  { id: 'M1',  name: 'Digital Marketplace',       status: 'LIVE' },
  { id: 'M2',  name: 'Customs Intelligence',      status: 'LIVE' },
  { id: 'M3',  name: 'Transport & Logistics',     status: 'LIVE' },
  { id: 'M4',  name: 'Inspection & QA',           status: 'LIVE' },
  { id: 'M5',  name: 'Insurance & Risk',          status: 'IN_DEV' },
  { id: 'M6',  name: 'Finance & Payments',        status: 'IN_DEV' },
  { id: 'M7',  name: 'Trade Agreement Intel',     status: 'LIVE' },
  { id: 'M8',  name: 'Buyer AI Assistant',        status: 'IN_DEV' },
  { id: 'M9',  name: 'Supplier AI Assistant',     status: 'IN_DEV' },
  { id: 'M10', name: 'Ads & Promotion',           status: 'LIVE' },
  { id: 'M11', name: 'Education & Webinars',      status: 'LIVE' },
  { id: 'M12', name: 'Cert/Sustainability/VR',    status: 'PLANNED' },
];

export const BUYER_JOURNEY = [
  'Buyer researches or submits inquiry',
  'Aaziko AI matches buyer with suitable sellers',
  'Buyer and seller communicate on Aaziko',
  'Buyer confirms order and pays 30% advance',
  'AAZIKO 100% ASSURANCE activates: product quality, quantity, and packing must match order contract',
  'Seller begins production — buyer receives photos and videos during manufacturing for transparency',
  'Once production complete, goods inspected by: Aaziko team, OR 3rd-party agency (SGS/Bureau Veritas/Intertek), OR buyer themselves / buyer\'s trusted person or company',
  'After inspection approval, goods sealed at warehouse before transport begins',
  'Buyer pays remaining 70% after inspection approval',
  'Aaziko coordinates logistics, insurance, customs documentation, shipment tracking — per chosen shipping term (EXW, FOB, CIF, or DDP)',
  'If issues arise, Aaziko provides dispute support using order records, inspection data, and communication history',
];

export const SELLER_JOURNEY = [
  'Seller creates profile and lists products',
  'Receives inquiry directly or via LSQ',
  'Accepts order and begins production',
  'Uploads production photos, facilitates inspection',
  'Buyer completes payment milestones',
  'Aaziko coordinates pickup, customs, freight, delivery',
];

export const GUARDRAILS = [
  { bad: 'Any manufacturer can become a global seller in 30 minutes.', good: 'Aaziko is designed to make onboarding fast, with a 30-minute target flow for many manufacturers.' },
  { bad: 'Aaziko is not commission-based.', good: 'Aaziko follows a win-win, service-led revenue model.' },
  { bad: 'Aaziko handles everything.', good: 'Aaziko reduces trade complexity while users retain control over approvals and business decisions.' },
  { bad: 'Guaranteed customs clearance.', good: 'Aaziko helps users understand customs requirements; final clearance depends on actual rules and authorities.' },
  { bad: 'Aaziko provides finance.', good: 'Aaziko can facilitate access to financing options through partner networks, subject to eligibility.' },
  { bad: 'Aaziko insures all shipments.', good: 'Aaziko supports access to insurance solutions through partners depending on transaction type.' },
  { bad: 'The AI can negotiate and verify everything.', good: 'Aaziko AI assistants are trade co-pilots within approved boundaries.' },
];

export const GLOSSARY: Record<string, string> = {
  RFQ: 'Request for Quotation — structured buyer inquiry for price and terms.',
  MOQ: 'Minimum Order Quantity — smallest commercial quantity a supplier will produce.',
  FOB: 'Free on Board — seller delivers at export port; buyer takes onward risk.',
  CIF: 'Cost, Insurance, Freight — seller covers freight and insurance to destination port.',
  'HS Code': 'Harmonized System classification for customs and trade.',
  COO: 'Certificate of Origin — states country where goods were made.',
  CHA: 'Customs House Agent — licensed customs filing professional.',
  'Golden Sample': 'Final approved sample that bulk production must match.',
  LSQ: 'Let Supplier Quote — multiple suppliers bid on a buyer inquiry.',
  TT: 'Telegraphic Transfer — wire payment.',
  LC: 'Letter of Credit — bank-guaranteed payment instrument.',
  AQL: 'Acceptable Quality Level — defect tolerance standard for inspections.',
  PSI: 'Pre-shipment Inspection — review before dispatch.',
  IEC: 'Import Export Code — mandatory for Indian exporters (DGFT).',
};

export const COMM_RULES = {
  style: ['clear', 'helpful', 'trust-building', 'human', 'commercially aware'],
  approved: ['Aaziko is designed to...', 'Aaziko helps simplify...', 'Aaziko can facilitate...'],
  forbidden: ['Guaranteed government benefits', 'Guaranteed finance approval', 'Guaranteed customs clearance'],
  tone: 'Sound like a trusted trade advisor, not a generic chatbot.',
};
