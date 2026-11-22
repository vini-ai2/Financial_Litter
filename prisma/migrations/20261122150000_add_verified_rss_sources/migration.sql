INSERT INTO "NewsSource" (
  "id", "key", "name", "organization", "jurisdiction", "category",
  "accessMethod", "officialUrl", "enabled", "retrievalConfig", "updatedAt"
) VALUES
  (
    'news-source-rbi-press-releases', 'rbi-press-releases', 'RBI press releases',
    'Reserve Bank of India', 'IN', 'CENTRAL_BANK', 'RSS',
    'https://www.rbi.org.in/Scripts/rss.aspx', TRUE,
    '{"feedUrl":"https://rbi.org.in/pressreleases_rss.xml","retainSummary":true,"attribution":"Reserve Bank of India"}'::jsonb,
    CURRENT_TIMESTAMP
  ),
  (
    'news-source-rbi-notifications', 'rbi-notifications', 'RBI notifications',
    'Reserve Bank of India', 'IN', 'CENTRAL_BANK', 'RSS',
    'https://www.rbi.org.in/Scripts/rss.aspx', TRUE,
    '{"feedUrl":"https://rbi.org.in/notifications_rss.xml","retainSummary":true,"attribution":"Reserve Bank of India"}'::jsonb,
    CURRENT_TIMESTAMP
  ),
  (
    'news-source-rbi-speeches', 'rbi-speeches', 'RBI speeches',
    'Reserve Bank of India', 'IN', 'CENTRAL_BANK', 'RSS',
    'https://www.rbi.org.in/Scripts/rss.aspx', TRUE,
    '{"feedUrl":"https://rbi.org.in/speeches_rss.xml","retainSummary":true,"attribution":"Reserve Bank of India"}'::jsonb,
    CURRENT_TIMESTAMP
  ),
  (
    'news-source-sebi-rss', 'sebi-rss', 'SEBI press releases, circulars and orders',
    'Securities and Exchange Board of India', 'IN', 'REGULATOR', 'RSS',
    'https://www.sebi.gov.in/rss.html', TRUE,
    '{"feedUrl":"https://www.sebi.gov.in/sebirss.xml","retainSummary":true,"attribution":"Securities and Exchange Board of India"}'::jsonb,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("key") DO NOTHING;
