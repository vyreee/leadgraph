// Test script to debug AI email parsing

const sampleAIOutput = `Subject: Ignite Your Potential with My Pipeline Solutions, A Better Plumber

Hello A Better Plumber team,

I recently came across your business in Denver and was impressed by your excellent 4.8-star rating with over 3,000 reviews. That's a testament to the quality service you provide!

I noticed you're already using some marketing technology and have a booking widget on your site - that's great. However, I believe there's an opportunity to take your online presence to the next level.

At My Pipeline Solutions, we specialize in Advertising and Marketing for local service businesses like yours. We've helped similar businesses increase their qualified leads by 40-60%.

Would you be open to a quick 15-minute call to discuss how we could help A Better Plumber generate even more high-quality leads?

Best regards,
[Your Name]
My Pipeline Solutions`;

console.log('=== ORIGINAL AI OUTPUT ===');
console.log(sampleAIOutput);
console.log('\n=== CURRENT PARSING (cleanOutput.js) ===');

// Current parsing logic
function extractEmailSubject(coldEmail) {
  if (!coldEmail) return '';
  const match = coldEmail.match(/^Subject:\s*(.+?)(?:\n|$)/m);
  return match ? match[1].trim() : '';
}

function extractEmailBody(coldEmail) {
  if (!coldEmail) return '';
  const withoutSubject = coldEmail.replace(/^Subject:.*?\n+/m, '').trim();
  return withoutSubject || coldEmail;
}

const subject = extractEmailSubject(sampleAIOutput);
const body = extractEmailBody(sampleAIOutput);

console.log('Subject:', subject);
console.log('Body:', body);
console.log('\nBody length:', body.length);
