/**
 * Clean and format lead data for final output
 * Removes unnecessary fields and creates actionable lead records
 */

export function cleanLeadForOutput(lead) {
  return {
    // Core Business Info
    businessName: lead.business.name,
    category: lead.business.category,
    address: lead.business.address.formatted,
    city: lead.business.address.city,
    state: lead.business.address.state,
    zip: lead.business.address.postalCode,
    
    // Contact Information
    phone: lead.business.phone,
    email: lead.contacts.emails[0]?.email || '',
    website: lead.online.website || '',
    
    // Additional Contacts
    additionalEmails: lead.contacts.emails.slice(1).map(e => e.email).join(', '),
    additionalPhones: lead.contacts.phones.slice(1).map(p => p.phone).join(', '),
    
    // Social Media
    facebook: lead.online.socials?.facebook || '',
    instagram: lead.online.socials?.instagram || '',
    linkedin: lead.online.socials?.linkedin || '',
    
    // Business Signals
    rating: lead.signals.reviews.rating,
    reviewCount: lead.signals.reviews.reviewCount,
    
    // Lead Quality
    leadScore: lead.score.leadScore,
    tier: lead.score.tier,
    scoreReasons: lead.score.reasons.join(', '),
    
    // Website Features (for context)
    hasContactForm: lead.signals.websiteSignals?.hasContactForm || false,
    hasBookingWidget: lead.signals.websiteSignals?.hasBookingWidget || false,
    hasChatWidget: lead.signals.websiteSignals?.hasChatWidget || false,
    
    // AI Outreach Content
    coldEmailSubject: extractEmailSubject(lead.ai?.coldEmail),
    coldEmailBody: extractEmailBody(lead.ai?.coldEmail),
    voicemailScript: lead.ai?.voicemail || '',
    smsMessage: lead.ai?.sms || '',
    
    // Metadata
    source: getSource(lead.sources),
    collectedAt: lead.raw.collectedAt,
    dedupeId: lead.dedupeId
  };
}

function extractEmailSubject(coldEmail) {
  if (!coldEmail) return '';
  const match = coldEmail.match(/^Subject:\s*(.+?)(?:\n|$)/);
  return match ? match[1].trim() : '';
}

function extractEmailBody(coldEmail) {
  if (!coldEmail) return '';
  const match = coldEmail.match(/Subject:.*?\n\n(.+)$/s);
  return match ? match[1].trim() : coldEmail;
}

function getSource(sources) {
  if (sources.googleMaps) return 'Google Maps';
  if (sources.yelp) return 'Yelp';
  if (sources.bbb) return 'BBB';
  if (sources.serp) return 'Google Search';
  return 'Unknown';
}

export function cleanLeadsForDataset(leads) {
  return leads.map(lead => cleanLeadForOutput(lead));
}
