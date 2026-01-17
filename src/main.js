import { Actor } from 'apify';
import { log } from 'crawlee';
import { scrapeGoogleMaps } from './discovery/googleMaps.js';
import { scrapeYelp } from './discovery/yelp.js';
import { scrapeBBB } from './discovery/bbb.js';
import { scrapeSERP } from './discovery/serp.js';
import { scrapeGoogleMapsApi } from './discovery/googleMapsApi.js';
import { scrapeYelpApi } from './discovery/yelpApi.js';
import { generateDedupeId } from './utils/dedupeId.js';
import { mergeLeads } from './processing/merge.js';
import { scoreLead } from './processing/scoring.js';
import { applyDeltaMode } from './utils/deltaMode.js';
import { validateInput } from './utils/validation.js';
import { crawlWebsite } from './enrichment/websiteCrawler.js';
import { extractEmails } from './enrichment/emailExtractor.js';
import { extractPhones } from './enrichment/phoneExtractor.js';
import { extractSocials } from './enrichment/socialExtractor.js';
import { detectTechSignals } from './enrichment/techSignals.js';
import { generateOutreach } from './ai/outreachDrafts.js';

await Actor.init();

const startTime = Date.now();

try {
  const input = await Actor.getInput();
  log.info('LeadGraph™ Actor started', { 
    keywords: input.keywords,
    locations: input.locations,
    sources: input.sources 
  });

  validateInput(input);

  const rawLeads = [];
  const keywords = input.keywords || [];
  const locations = input.locations || [];
  const sources = input.sources || ['googleMaps', 'yelp'];

  log.info('Starting discovery phase', { 
    keywordCount: keywords.length, 
    locationCount: locations.length,
    sources: sources 
  });

  const useApis = input.useApis || false;
  
  if (useApis) {
    log.info('Using API mode (faster, more reliable)');
  } else {
    log.info('Using web scraping mode (free, slower)');
  }

  for (const location of locations) {
    for (const keyword of keywords) {
      log.info(`Processing: ${keyword} in ${location}`);

      if (sources.includes('googleMaps')) {
        try {
          const gmLeads = useApis 
            ? await scrapeGoogleMapsApi(keyword, location, input)
            : await scrapeGoogleMaps(keyword, location, input);
          rawLeads.push(...gmLeads);
          log.info(`Google Maps: ${gmLeads.length} leads found`);
        } catch (error) {
          log.error('Google Maps scraping failed', { error: error.message });
        }
      }

      if (sources.includes('yelp')) {
        try {
          const yelpLeads = useApis
            ? await scrapeYelpApi(keyword, location, input)
            : await scrapeYelp(keyword, location, input);
          rawLeads.push(...yelpLeads);
          log.info(`Yelp: ${yelpLeads.length} leads found`);
        } catch (error) {
          log.error('Yelp scraping failed', { error: error.message });
        }
      }

      if (sources.includes('bbb')) {
        try {
          const bbbLeads = await scrapeBBB(keyword, location, input);
          rawLeads.push(...bbbLeads);
          log.info(`BBB: ${bbbLeads.length} leads found`);
        } catch (error) {
          log.error('BBB scraping failed', { error: error.message });
        }
      }

      if (sources.includes('serp')) {
        try {
          const serpLeads = await scrapeSERP(keyword, location, input);
          rawLeads.push(...serpLeads);
          log.info(`SERP: ${serpLeads.length} leads found`);
        } catch (error) {
          log.error('SERP scraping failed', { error: error.message });
        }
      }

      if (rawLeads.length >= (input.maxTotalResults || 500)) {
        log.info('Max total results reached, stopping discovery');
        break;
      }
    }

    if (rawLeads.length >= (input.maxTotalResults || 500)) {
      break;
    }
  }

  log.info(`Discovery complete: ${rawLeads.length} raw leads collected`);

  if (rawLeads.length === 0) {
    log.warning('No leads found. Check your search criteria.');
    await Actor.setValue('RUN_SUMMARY', {
      totalFound: 0,
      totalAfterDedupe: 0,
      enrichedCount: 0,
      aiCount: 0,
      errors: ['No leads found'],
      sourceCoverage: {},
      runTimeMs: Date.now() - startTime
    });
  } else {

  log.info('Starting deduplication phase');
  rawLeads.forEach(lead => {
    lead.dedupeId = generateDedupeId(lead.business);
  });

  const mergedLeads = input.dedupe?.enabled !== false 
    ? mergeLeads(rawLeads) 
    : rawLeads;

  log.info(`After dedupe: ${mergedLeads.length} unique leads (${rawLeads.length - mergedLeads.length} duplicates removed)`);

  if (input.filters?.minRating || input.filters?.minReviews || input.filters?.requireWebsite) {
    log.info('Applying filters');
    const beforeFilter = mergedLeads.length;
    
    const filtered = mergedLeads.filter(lead => {
      if (input.filters.minRating && (lead.signals?.reviews?.rating || 0) < input.filters.minRating) {
        return false;
      }
      if (input.filters.minReviews && (lead.signals?.reviews?.reviewCount || 0) < input.filters.minReviews) {
        return false;
      }
      if (input.filters.requireWebsite && !lead.online?.website) {
        return false;
      }
      return true;
    });
    
    log.info(`Filters applied: ${beforeFilter} → ${filtered.length} leads`);
    mergedLeads.length = 0;
    mergedLeads.push(...filtered);
  }

  if (input.enrichment?.crawlWebsite) {
    log.info('Starting enrichment phase');
    let enrichedCount = 0;
    
    // PARALLEL ENRICHMENT: Process 2 leads at a time (reduced from 5 to avoid OOM)
    const leadsToEnrich = mergedLeads.filter(lead => lead.online?.website);
    const batchSize = 2;
    
    for (let i = 0; i < leadsToEnrich.length; i += batchSize) {
      const batch = leadsToEnrich.slice(i, i + batchSize);
      log.info(`Enriching batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(leadsToEnrich.length / batchSize)} (${batch.length} leads in parallel)`);
      
      // Process batch in parallel
      await Promise.all(batch.map(async (lead) => {
        try {
          log.info(`Enriching: ${lead.business.name}`);
          
          const crawlResult = await crawlWebsite(lead.online.website, input);
          
          if (crawlResult.htmlContent) {
            const emails = extractEmails(crawlResult.htmlContent, lead.online.domain);
            const phones = extractPhones(crawlResult.htmlContent);
            const socials = extractSocials(crawlResult.htmlContent);
            const techSignals = detectTechSignals(crawlResult.htmlContent);
            
            if (emails.length > 0) {
              lead.contacts.emails = [...lead.contacts.emails, ...emails];
            }
            
            if (phones.length > 0) {
              lead.contacts.phones = [...lead.contacts.phones, ...phones];
            }
            
            lead.online.socials = socials;
            
            lead.signals.websiteSignals = {
              hasHttps: lead.online.website.startsWith('https'),
              hasContactForm: crawlResult.metadata.hasContactForm || false,
              hasBookingWidget: crawlResult.metadata.hasBookingWidget || false,
              hasChatWidget: crawlResult.metadata.hasChatWidget || false
            };
            
            lead.signals.techSignals = techSignals;
            
            if (emails.length > 0 || phones.length > 0 || Object.values(socials).some(s => s)) {
              enrichedCount++;
            }
          }
        } catch (error) {
          log.warning(`Enrichment failed for ${lead.business.name}:`, error.message);
        }
      }));
      
      // Small delay between batches to avoid overwhelming the system
      if (i + batchSize < leadsToEnrich.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    log.info(`Enrichment complete: ${enrichedCount}/${leadsToEnrich.length} leads enriched`);
  }

  if (input.scoring?.enabled !== false) {
    log.info('Starting scoring phase');
    for (const lead of mergedLeads) {
      lead.score = scoreLead(lead, input.scoring?.weightsPreset || 'localService');
    }
    log.info('Scoring complete');
  }

  if (input.ai?.enabled) {
    log.info('Starting AI outreach generation');
    let aiCount = 0;
    
    for (let i = 0; i < mergedLeads.length; i++) {
      const lead = mergedLeads[i];
      try {
        const outreach = await generateOutreach(lead, input);
        
        if (outreach.coldEmail || outreach.voicemail || outreach.sms) {
          lead.ai = {
            coldEmail: outreach.coldEmail,
            voicemail: outreach.voicemail,
            sms: outreach.sms,
            generatedAt: new Date().toISOString()
          };
          aiCount++;
        }
        
        // Add delay between API calls to avoid rate limiting (1 second)
        if (i < mergedLeads.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        log.warning(`AI generation failed for ${lead.business.name}:`, error.message);
      }
    }
    
    log.info(`AI outreach complete: ${aiCount}/${mergedLeads.length} leads with AI content`);
  }

  let finalLeads = mergedLeads;

  if (input.exports?.deltaMode) {
    log.info('Applying delta mode');
    finalLeads = await applyDeltaMode(mergedLeads);
    log.info(`Delta mode: ${finalLeads.length} new/changed leads`);
  }

  finalLeads.forEach(lead => {
    lead.raw.runId = Actor.getEnv().actorRunId || '';
  });

  // Clean output for final dataset (remove unnecessary fields)
  const { cleanLeadsForDataset } = await import('./utils/cleanOutput.js');
  const cleanedLeads = cleanLeadsForDataset(finalLeads);

  log.info(`Saving ${cleanedLeads.length} leads to dataset (cleaned format)`);
  await Actor.pushData(cleanedLeads);

  const sourceCoverage = {};
  for (const lead of rawLeads) {
    for (const source in lead.sources) {
      sourceCoverage[source] = (sourceCoverage[source] || 0) + 1;
    }
  }

  const enrichedCount = mergedLeads.filter(lead => 
    lead.contacts?.emails?.length > 0 || 
    lead.online?.socials && Object.values(lead.online.socials).some(s => s)
  ).length;

  const aiCount = mergedLeads.filter(lead => 
    lead.ai?.coldEmail || lead.ai?.voicemail || lead.ai?.sms
  ).length;

  const summary = {
    totalFound: rawLeads.length,
    totalAfterDedupe: mergedLeads.length,
    enrichedCount: enrichedCount,
    aiCount: aiCount,
    created: finalLeads.length,
    updated: 0,
    skipped: mergedLeads.length - finalLeads.length,
    errors: [],
    sourceCoverage: sourceCoverage,
    runTimeMs: Date.now() - startTime
  };

  await Actor.setValue('RUN_SUMMARY', summary);

  log.info('LeadGraph™ Actor finished successfully', {
    totalLeads: finalLeads.length,
    runtime: `${Math.round(summary.runTimeMs / 1000)}s`
  });
  }

} catch (error) {
  log.error('Actor failed', { error: error.message, stack: error.stack });
  throw error;
} finally {
  await Actor.exit();
}
