-- Small curated identification vocabulary only; it contains no news or market observations.
INSERT INTO "NewsEntity" ("id", "canonicalName", "normalizedName", "type", "jurisdiction", "createdAt", "updatedAt") VALUES
  ('pulse-reg-rbi', 'Reserve Bank of India', 'reserve bank of india', 'REGULATOR', 'IN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pulse-reg-sebi', 'Securities and Exchange Board of India', 'securities and exchange board of india', 'REGULATOR', 'IN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pulse-co-reliance', 'Reliance Industries Limited', 'reliance industries limited', 'COMPANY', 'IN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pulse-co-tcs', 'Tata Consultancy Services Limited', 'tata consultancy services limited', 'COMPANY', 'IN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pulse-co-infosys', 'Infosys Limited', 'infosys limited', 'COMPANY', 'IN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pulse-co-hdfc', 'HDFC Bank Limited', 'hdfc bank limited', 'COMPANY', 'IN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pulse-co-icici', 'ICICI Bank Limited', 'icici bank limited', 'COMPANY', 'IN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pulse-co-sbi', 'State Bank of India', 'state bank of india', 'COMPANY', 'IN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pulse-co-wipro', 'Wipro Limited', 'wipro limited', 'COMPANY', 'IN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pulse-co-adani', 'Adani Enterprises Limited', 'adani enterprises limited', 'COMPANY', 'IN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pulse-co-airtel', 'Bharti Airtel Limited', 'bharti airtel limited', 'COMPANY', 'IN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pulse-sector-fin-services', 'Financial services', 'financial services', 'SECTOR', 'IN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pulse-sector-banking', 'Banking', 'banking', 'SECTOR', 'IN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pulse-sector-it', 'Information technology', 'information technology', 'SECTOR', 'IN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pulse-sector-energy', 'Energy', 'energy', 'SECTOR', 'IN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pulse-sector-telecom', 'Telecommunications', 'telecommunications', 'SECTOR', 'IN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "NewsEntityAlias" ("id", "entityId", "alias", "normalizedAlias") VALUES
  ('pulse-alias-rbi', 'pulse-reg-rbi', 'RBI', 'rbi'),
  ('pulse-alias-sebi', 'pulse-reg-sebi', 'SEBI', 'sebi'),
  ('pulse-alias-ril', 'pulse-co-reliance', 'Reliance Industries', 'reliance industries'),
  ('pulse-alias-tcs', 'pulse-co-tcs', 'TCS', 'tcs'),
  ('pulse-alias-infosys', 'pulse-co-infosys', 'Infosys', 'infosys'),
  ('pulse-alias-hdfc', 'pulse-co-hdfc', 'HDFC Bank', 'hdfc bank'),
  ('pulse-alias-icici', 'pulse-co-icici', 'ICICI Bank', 'icici bank'),
  ('pulse-alias-sbi', 'pulse-co-sbi', 'SBI', 'sbi'),
  ('pulse-alias-wipro', 'pulse-co-wipro', 'Wipro', 'wipro'),
  ('pulse-alias-adani', 'pulse-co-adani', 'Adani Enterprises', 'adani enterprises'),
  ('pulse-alias-airtel', 'pulse-co-airtel', 'Airtel', 'airtel'),
  ('pulse-alias-fin-services', 'pulse-sector-fin-services', 'financial services sector', 'financial services sector'),
  ('pulse-alias-banking-sector', 'pulse-sector-banking', 'banking sector', 'banking sector'),
  ('pulse-alias-it', 'pulse-sector-it', 'IT sector', 'it sector'),
  ('pulse-alias-energy', 'pulse-sector-energy', 'energy sector', 'energy sector'),
  ('pulse-alias-telecom', 'pulse-sector-telecom', 'telecom sector', 'telecom sector')
ON CONFLICT ("id") DO NOTHING;
