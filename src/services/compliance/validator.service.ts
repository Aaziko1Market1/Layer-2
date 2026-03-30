import logger from '../../utils/logger';
import { ComplianceInfo, ComplianceFlag } from '../../models/types';

export interface ValidationResult {
  isValid: boolean;
  flaggedClaims: ComplianceFlag[];
  editedResponse?: string;
  humanReviewNeeded: boolean;
}

const NUMERIC_CLAIM_REGEX = /(\d+(?:\.\d+)?)\s*%/g;
const PRICE_CLAIM_REGEX = /\$\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/g;

export function validateResponse(
  response: string,
  complianceData: ComplianceInfo | null
): ValidationResult {
  const startTime = Date.now();
  const flaggedClaims: ComplianceFlag[] = [];
  let editedResponse = response;
  let humanReviewNeeded = false;

  if (!complianceData) {
    logger.info('validateResponse: no compliance data, skipping validation');
    return { isValid: true, flaggedClaims: [], humanReviewNeeded: false };
  }

  const confidence = complianceData.data_confidence_score;

  // Check duty rate claims
  const dutyMatches = [...response.matchAll(/(?:duty|tariff|import\s*tax)\s*(?:is|of|at|:)?\s*(\d+(?:\.\d+)?)\s*%/gi)];
  for (const match of dutyMatches) {
    const claimedRate = parseFloat(match[1]);
    const actualRate = complianceData.import_duty_rate;

    if (Math.abs(claimedRate - actualRate) > 1) {
      const flag: ComplianceFlag = {
        claim: `Duty rate: ${claimedRate}%`,
        expected: `${actualRate}%`,
        actual: match[0],
        confidence,
        action: confidence >= 0.85 ? 'auto_edited' : 'flagged_for_review',
      };

      if (confidence >= 0.85) {
        editedResponse = editedResponse.replace(
          match[0],
          match[0].replace(String(claimedRate), String(actualRate))
        );
        flag.action = 'auto_edited';
      } else if (confidence >= 0.6) {
        editedResponse = editedResponse.replace(
          match[0],
          `approximately ${actualRate}% (based on our latest data)`
        );
        flag.action = 'auto_edited';
      } else {
        humanReviewNeeded = true;
        flag.action = 'flagged_for_review';
      }

      flaggedClaims.push(flag);
    }
  }

  // Check VAT rate claims
  const vatMatches = [...response.matchAll(/(?:vat|value\s*added\s*tax)\s*(?:is|of|at|:)?\s*(\d+(?:\.\d+)?)\s*%/gi)];
  for (const match of vatMatches) {
    const claimedRate = parseFloat(match[1]);
    const actualRate = complianceData.vat_rate;

    if (Math.abs(claimedRate - actualRate) > 0.5) {
      const flag: ComplianceFlag = {
        claim: `VAT: ${claimedRate}%`,
        expected: `${actualRate}%`,
        actual: match[0],
        confidence,
        action: confidence >= 0.85 ? 'auto_edited' : 'flagged_for_review',
      };

      if (confidence >= 0.6) {
        editedResponse = editedResponse.replace(
          match[0],
          match[0].replace(String(claimedRate), String(actualRate))
        );
        flag.action = 'auto_edited';
      } else {
        humanReviewNeeded = true;
        flag.action = 'flagged_for_review';
      }

      flaggedClaims.push(flag);
    }
  }

  // Check certification claims against known requirements
  if (complianceData.required_certifications?.length > 0) {
    const certKeywords = complianceData.required_certifications.map((c) => c.toLowerCase());
    const responseLower = response.toLowerCase();

    for (const cert of certKeywords) {
      if (responseLower.includes('no certification') || responseLower.includes('no cert')) {
        if (cert) {
          flaggedClaims.push({
            claim: 'Claims no certification needed',
            expected: `Required: ${complianceData.required_certifications.join(', ')}`,
            actual: 'no certification',
            confidence,
            action: 'flagged_for_review',
          });
          humanReviewNeeded = true;
        }
      }
    }
  }

  // If confidence < 60%, flag entire response for review
  if (confidence < 0.6 && flaggedClaims.length === 0) {
    const hasAnyTradeData = NUMERIC_CLAIM_REGEX.test(response) || PRICE_CLAIM_REGEX.test(response);
    if (hasAnyTradeData) {
      humanReviewNeeded = true;
      flaggedClaims.push({
        claim: 'Response contains trade data with low confidence compliance info',
        expected: 'Human verification required',
        actual: 'Low confidence data source',
        confidence,
        action: 'flagged_for_review',
      });
    }
  }

  const isValid = flaggedClaims.length === 0;
  const elapsed = Date.now() - startTime;

  logger.info('validateResponse', {
    isValid,
    flaggedClaims: flaggedClaims.length,
    humanReviewNeeded,
    confidence,
    elapsed,
  });

  return {
    isValid,
    flaggedClaims,
    editedResponse: editedResponse !== response ? editedResponse : undefined,
    humanReviewNeeded,
  };
}
