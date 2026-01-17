import { log } from 'crawlee';

export async function generateOutreach(lead, options) {
  if (!options?.ai?.enabled) {
    return {
      coldEmail: '',
      voicemail: '',
      sms: ''
    };
  }

  const apiKey = options?.ai?.openaiApiKey || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    log.warning('OpenAI API key not provided - skipping AI outreach generation');
    return {
      coldEmail: '',
      voicemail: '',
      sms: ''
    };
  }

  try {
    const businessName = lead.business.name;
    const category = lead.business.category;
    const location = lead.business.address.city || lead.business.address.formatted;
    const website = lead.online.website;
    const hasWebsite = !!website;
    const rating = lead.signals?.reviews?.rating || 0;
    const reviewCount = lead.signals?.reviews?.reviewCount || 0;
    const leadScore = lead.score?.leadScore || 0;
    const tier = lead.score?.tier || 'D';
    const hasEmail = lead.contacts?.emails?.length > 0;
    const hasContactForm = lead.signals?.websiteSignals?.hasContactForm || false;
    const hasBookingWidget = lead.signals?.websiteSignals?.hasBookingWidget || false;
    const hasChatWidget = lead.signals?.websiteSignals?.hasChatWidget || false;
    const techSignals = lead.signals?.techSignals || {};

    const prompt = buildPrompt({
      businessName,
      category,
      location,
      hasWebsite,
      rating,
      reviewCount,
      leadScore,
      tier,
      hasEmail,
      hasContactForm,
      hasBookingWidget,
      hasChatWidget,
      techSignals,
      options
    });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: options?.ai?.model || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert B2B sales copywriter with 10+ years of experience crafting personalized outreach for local service businesses. You write compelling, value-driven messages that get responses. Your style is professional yet conversational, focusing on specific pain points and concrete benefits rather than generic pitches.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 1500
      })
    });

    if (!response.ok) {
      log.error(`OpenAI API error: ${response.status} ${response.statusText}`);
      return { coldEmail: '', voicemail: '', sms: '' };
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';

    const outreach = parseOutreachResponse(content);

    log.info(`Generated AI outreach for ${businessName}`);
    return outreach;

  } catch (error) {
    log.error('AI outreach generation failed:', error.message);
    return {
      coldEmail: '',
      voicemail: '',
      sms: ''
    };
  }
}

function buildPrompt({
  businessName,
  category,
  location,
  hasWebsite,
  rating,
  reviewCount,
  leadScore,
  tier,
  hasEmail,
  hasContactForm,
  hasBookingWidget,
  hasChatWidget,
  techSignals,
  options
}) {
  const yourCompany = options?.ai?.yourCompany?.name || 'Digital Growth Partners';
  const yourServices = options?.ai?.yourCompany?.services || 'website design, SEO, and lead generation';
  const targetAudience = options?.ai?.yourCompany?.targetAudience || 'local service businesses';
  
  // Build context about the business
  let businessContext = `Business: ${businessName}
Category: ${category}
Location: ${location}
`;
  
  if (rating > 0) {
    businessContext += `Reputation: ${rating}/5 stars (${reviewCount} reviews) - ${rating >= 4.5 ? 'Excellent' : rating >= 4.0 ? 'Strong' : 'Good'} reputation\n`;
  }
  
  businessContext += `Lead Quality: ${tier} tier (Score: ${leadScore}/100)\n`;
  
  // Website & tech insights
  let techContext = '';
  if (hasWebsite) {
    techContext += `\nWebsite Features:\n`;
    if (hasContactForm) techContext += `- Has contact form\n`;
    if (hasBookingWidget) techContext += `- Has booking widget\n`;
    if (hasChatWidget) techContext += `- Has chat widget\n`;
    
    const hasTech = Object.values(techSignals).some(v => v);
    if (hasTech) {
      techContext += `Marketing Tech: `;
      const activeTech = Object.entries(techSignals)
        .filter(([_, active]) => active)
        .map(([tech, _]) => tech);
      techContext += activeTech.length > 0 ? activeTech.join(', ') : 'None detected';
      techContext += `\n`;
    } else {
      techContext += `Marketing Tech: None detected (opportunity for improvement)\n`;
    }
  } else {
    techContext += `\nWebsite: None found (major opportunity!)\n`;
  }
  
  return `You're reaching out to a ${category} business on behalf of ${yourCompany}, which provides ${yourServices} for ${targetAudience}.

${businessContext}${techContext}
Your Task: Create highly personalized outreach that:
1. References specific details about THEIR business (location, reputation, current tech setup)
2. Identifies a relevant pain point or opportunity based on their current situation
3. Positions your services as the solution with concrete benefits
4. Uses their business name naturally (not just in greeting)
5. Includes social proof or credibility elements
6. Has a clear, low-friction call-to-action

Tone: Professional but warm, consultative not salesy, confident but not pushy.

Generate 3 outreach formats:

1. COLD EMAIL (200-250 words)
   - Compelling subject line that mentions their business or a specific insight
   - Personalized opening that shows you researched them
   - 2-3 specific value propositions relevant to their situation
   - Clear CTA with next step

2. VOICEMAIL SCRIPT (45-60 seconds)
   - Natural conversational tone
   - Hook them in first 10 seconds
   - Mention specific detail about their business
   - Clear reason to call back

3. SMS MESSAGE (140-160 characters)
   - Ultra-concise but personalized
   - Include business name
   - One specific hook
   - Clear CTA

Format EXACTLY as:

COLD_EMAIL_SUBJECT:
[subject line]

COLD_EMAIL_BODY:
[email body]

VOICEMAIL:
[voicemail script]

SMS:
[sms message]`;
}

function parseOutreachResponse(content) {
  const outreach = {
    coldEmail: '',
    voicemail: '',
    sms: ''
  };

  try {
    const subjectMatch = content.match(/COLD_EMAIL_SUBJECT:\s*\n(.+?)(?=\n\n|COLD_EMAIL_BODY:)/s);
    const bodyMatch = content.match(/COLD_EMAIL_BODY:\s*\n(.+?)(?=\n\n|VOICEMAIL:)/s);
    const voicemailMatch = content.match(/VOICEMAIL:\s*\n(.+?)(?=\n\n|SMS:)/s);
    const smsMatch = content.match(/SMS:\s*\n(.+?)$/s);

    if (subjectMatch && bodyMatch) {
      const subject = subjectMatch[1].trim();
      const body = bodyMatch[1].trim();
      outreach.coldEmail = `Subject: ${subject}\n\n${body}`;
    }

    if (voicemailMatch) {
      outreach.voicemail = voicemailMatch[1].trim();
    }

    if (smsMatch) {
      outreach.sms = smsMatch[1].trim();
    }

  } catch (error) {
    log.warning('Failed to parse AI response:', error.message);
  }

  return outreach;
}
