jest.mock('fs', () => ({
  readFileSync: jest.fn().mockImplementation((filePath: string) => {
    if (filePath.includes('arjun-identity')) return 'You are Arjun Mehta, Senior Trade Advisor at Aaziko.';
    if (filePath.includes('channel-email')) return 'Format: professional email. Use subject lines.';
    if (filePath.includes('channel-whatsapp')) return 'Format: short WhatsApp messages.';
    if (filePath.includes('channel-linkedin')) return 'Format: LinkedIn professional message.';
    if (filePath.includes('channel-chat')) return 'Format: live chat, quick responses.';
    if (filePath.includes('layer3-buyer')) return 'Buyer: {buyer_name}, Country: {country}, Tier: {tier}, Volume: ${total_volume_usd}, HS: {hs_codes}, Suppliers: {indian_suppliers}, History:\n{last_10_messages}';
    if (filePath.includes('layer4-trade-intel')) return 'HS: {hs_code}, Duty: {duty_rate}, Conf: {conf}, Certs: {certs}, Docs: {docs}';
    if (filePath.includes('layer5-products')) return 'Matching sellers:\n{matching_sellers}';
    return 'Mock template content';
  }),
}));

jest.mock('../src/config/env', () => ({
  env: { LOG_LEVEL: 'error' },
}));

jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { buildPrompt } from '../src/services/orchestrator/prompt-builder/prompt-builder';
import { BuyerProfile, ComplianceInfo, Product, ConversationMessage } from '../src/models/types';

function makeBuyer(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    normalized_name: 'john smith',
    buyer_name: 'John Smith',
    country: 'United States',
    hs_codes: ['8471', '8542'],
    product_categories: ['electronics', 'semiconductors'],
    total_trade_volume_usd: 750000,
    total_quantity: 15000,
    avg_unit_price_usd: 50,
    trade_count: 30,
    first_trade_date: new Date('2019-06-15'),
    last_trade_date: new Date('2024-03-01'),
    trade_frequency_per_month: 1.5,
    ports_used: ['USLAX', 'USNYC'],
    indian_suppliers: ['ABC Electronics', 'XYZ Tech'],
    top_supplier: 'ABC Electronics',
    buyer_addresses: ['123 Silicon Valley Blvd'],
    buyer_tier: 'gold',
    communication_model_tier: 'premium',
    last_updated: new Date(),
    ...overrides,
  };
}

function makeCompliance(overrides: Partial<ComplianceInfo> = {}): ComplianceInfo {
  return {
    hs_code: '8471',
    country: 'United States',
    import_duty_rate: 0,
    vat_rate: 0,
    excise_rate: 0,
    anti_dumping_duty: 0,
    required_certifications: ['FCC', 'UL'],
    ntm_codes: ['B31'],
    required_documents: ['Commercial Invoice', 'Bill of Lading'],
    labeling_requirements: ['Country of Origin'],
    special_permits: [],
    data_confidence_score: 0.95,
    ...overrides,
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    product_name: 'Industrial PCB Assembly',
    category: 'electronics',
    hs_code: '8471',
    seller_name: 'TechParts India',
    seller_location: 'Bangalore',
    seller_verified: true,
    price_range_usd: { min: 10, max: 25 },
    moq: 500,
    certifications: ['ISO 9001', 'RoHS'],
    description: 'High quality PCB assembly for industrial applications',
    ...overrides,
  };
}

describe('Prompt Builder', () => {
  it('builds a prompt with all 5 layers', () => {
    const prompt = buildPrompt({
      channel: 'email',
      buyerProfile: makeBuyer(),
      conversationHistory: [],
      tradeIntelligence: makeCompliance(),
      matchingProducts: [makeProduct()],
    });

    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(50);
    expect(prompt).toContain('Arjun');
    expect(prompt).toContain('John Smith');
    expect(prompt).toContain('United States');
    expect(prompt).toContain('8471');
    expect(prompt).toContain('TechParts India');
  });

  it('builds prompt for different channels', () => {
    const base = {
      buyerProfile: makeBuyer(),
      conversationHistory: [] as ConversationMessage[],
      tradeIntelligence: makeCompliance(),
      matchingProducts: [makeProduct()],
    };

    const emailPrompt = buildPrompt({ ...base, channel: 'email' });
    const whatsappPrompt = buildPrompt({ ...base, channel: 'whatsapp' });
    const chatPrompt = buildPrompt({ ...base, channel: 'chat' });

    expect(emailPrompt.length).toBeGreaterThan(50);
    expect(whatsappPrompt.length).toBeGreaterThan(50);
    expect(chatPrompt.length).toBeGreaterThan(50);
  });

  it('handles null compliance data', () => {
    const prompt = buildPrompt({
      channel: 'email',
      buyerProfile: makeBuyer(),
      conversationHistory: [],
      tradeIntelligence: null,
      matchingProducts: [],
    });

    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(50);
  });

  it('includes emotion directive when provided', () => {
    const prompt = buildPrompt({
      channel: 'email',
      buyerProfile: makeBuyer(),
      conversationHistory: [],
      tradeIntelligence: null,
      matchingProducts: [],
      emotionDirective: 'The buyer sounds frustrated. Acknowledge their frustration first.',
    });

    expect(prompt).toContain('frustrated');
  });

  it('redacts low confidence compliance data', () => {
    const prompt = buildPrompt({
      channel: 'email',
      buyerProfile: makeBuyer(),
      conversationHistory: [],
      tradeIntelligence: makeCompliance({ data_confidence_score: 0.5 }),
      matchingProducts: [],
    });

    expect(prompt).toContain('REDACTED');
  });

  it('marks approximate compliance data', () => {
    const prompt = buildPrompt({
      channel: 'email',
      buyerProfile: makeBuyer(),
      conversationHistory: [],
      tradeIntelligence: makeCompliance({ data_confidence_score: 0.75 }),
      matchingProducts: [],
    });

    expect(prompt).toContain('approximate');
  });
});
