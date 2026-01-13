import { log } from 'crawlee';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Crawl4AI Client - Uses Crawl4AI Python library for advanced web scraping with bot detection bypass
 * Calls Python wrapper script that uses Crawl4AI directly
 */

export class Crawl4AIClient {
  constructor() {
    this.available = false;
    this.pythonPath = 'python3';
    this.wrapperPath = join(__dirname, 'crawl4ai_wrapper.py');
  }

  async checkAvailability() {
    try {
      // Check if Python and Crawl4AI are available
      const result = await this.runPythonCommand('import crawl4ai; print("OK")');
      this.available = result.trim() === 'OK';
      return this.available;
    } catch (error) {
      this.available = false;
      return false;
    }
  }

  async runPythonCommand(command) {
    return new Promise((resolve, reject) => {
      const python = spawn(this.pythonPath, ['-c', command]);
      let output = '';
      let error = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        error += data.toString();
      });

      python.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(error || 'Python command failed'));
        }
      });
    });
  }

  async crawlUrl(url, options = {}) {
    const {
      timeout = 30
    } = options;

    try {
      const input = JSON.stringify({
        url: url,
        timeout: timeout
      });

      const result = await new Promise((resolve, reject) => {
        const python = spawn(this.pythonPath, [this.wrapperPath]);
        let output = '';
        let error = '';

        python.stdout.on('data', (data) => {
          output += data.toString();
        });

        python.stderr.on('data', (data) => {
          // Ignore stderr - Crawl4AI outputs progress there
          error += data.toString();
        });

        python.on('close', (code) => {
          if (code === 0) {
            try {
              // Extract only the last line (JSON output)
              const lines = output.trim().split('\n');
              const jsonLine = lines[lines.length - 1];
              resolve(JSON.parse(jsonLine));
            } catch (e) {
              reject(new Error(`Failed to parse Python output: ${output.substring(0, 200)}`));
            }
          } else {
            reject(new Error(error || 'Python script failed'));
          }
        });

        // Send input to Python script
        python.stdin.write(input);
        python.stdin.end();

        // Set timeout
        setTimeout(() => {
          python.kill();
          reject(new Error('Crawl timeout'));
        }, (timeout + 5) * 1000);
      });

      if (result.success) {
        log.info(`Crawl4AI successfully crawled ${url}`);
      } else {
        log.warning(`Crawl4AI failed for ${url}: ${result.error}`);
      }

      return result;

    } catch (error) {
      log.warning(`Crawl4AI crawl failed for ${url}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async crawlMultiple(urls, options = {}) {
    const results = [];
    
    for (const url of urls) {
      const result = await this.crawlUrl(url, options);
      results.push(result);
      
      // Small delay between requests to be respectful
      if (urls.indexOf(url) < urls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    return results;
  }
}

/**
 * Fallback: Simple fetch-based crawler when Crawl4AI is not available
 */
export async function simpleFetch(url, timeout = 10000) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: AbortSignal.timeout(timeout)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    
    return {
      success: true,
      url: url,
      html: html,
      text: html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
