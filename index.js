const express = require("express");
const puppeteer = require("puppeteer");
require("dotenv").config();

const app = express();
app.use(express.json());

// Puppeteer scraping function
async function scrapeUpworkJobs(searchQuery = "", pageNum = 1) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
    );

    // Navigate to Upwork search page
    const searchUrl = `https://www.upwork.com/nx/search/jobs?per_page=50&q=${encodeURIComponent(
      searchQuery
    )}&sort=recency&page=${pageNum}`;
    await page.goto(searchUrl, { waitUntil: "networkidle0" });

    // Wait for job listings to load
    await page.waitForSelector("article.job-tile");

    // Extract job data
    const jobs = await page.evaluate(() => {
      const jobArticles = document.querySelectorAll("article.job-tile");

      return Array.from(jobArticles).map((article) => {
        // Helper function to safely extract text
        const getText = (selector) => {
          const element = article.querySelector(selector);
          return element ? element.textContent.trim() : "";
        };

        // Extract link
        const linkElement = article.querySelector("h2 a");
        const link = linkElement
          ? "https://www.upwork.com" + linkElement.getAttribute("href")
          : "";

        // Extract payment verified status
        const paymentVerified =
          article.querySelector(
            'div[data-test="payment-verified"] svg path[fill]'
          ) !== null;

        // Extract client rating
        const ratingText = getText("div.air3-rating-value-text");
        const rating = ratingText ? parseFloat(ratingText) : 0;

        // Extract skills
        const skillElements = article.querySelectorAll(
          'div[data-test="TokenClamp JobAttrs"] span'
        );
        const skills = Array.from(skillElements).map((el) =>
          el.textContent.trim()
        );
        const sanitizedLink = link?.split?.("/?")?.[0];

        return {
          id: sanitizedLink?.split?.("~")?.pop(),
          title: getText("h2.job-tile-title"),
          link: sanitizedLink,
          description: getText('div[data-test="JobDescription"] p'),
          posted: getText('span[data-test="job-pubilshed-date"]')
            .replace("Posted", "")
            .trim(),
          location: getText('div[data-test="location"]'),
          budget: getText(
            'li[data-test="is-fixed-price"], li[data-test="job-type-label"]'
          ),
          clientSpent: getText('li[data-test="total-spent"]'),
          paymentVerified: paymentVerified,
          clientRating: rating,
          experienceLevel: getText('li[data-test="experience-level"] strong'),
          proposals: getText('li[data-test="proposals-tier"]')
            .replace("Proposals:", "")
            .trim(),
          skills: skills,
          timestamp: new Date().toISOString(),
        };
      });
    });

    await browser.close();
    return jobs;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy" });
});

// Fetch jobs route
app.get("/api/jobs", async (req, res) => {
  try {
    const { query = "", page = 1 } = req.query;
    const jobs = await scrapeUpworkJobs(query, parseInt(page));
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search jobs route
app.get("/api/jobs/search", async (req, res) => {
  try {
    const {
      q = "",
      page = 1,
      skills,
      location,
      minBudget,
      maxBudget,
    } = req.query;

    let jobs = await scrapeUpworkJobs(q, parseInt(page));

    // Filter by skills if provided
    if (skills) {
      const skillsArray = skills.split(",").map((s) => s.toLowerCase().trim());
      jobs = jobs.filter((job) =>
        job.skills.some((skill) => skillsArray.includes(skill.toLowerCase()))
      );
    }

    // Filter by location if provided
    if (location) {
      jobs = jobs.filter((job) =>
        job.location.toLowerCase().includes(location.toLowerCase())
      );
    }

    // Filter by budget range if provided
    if (minBudget || maxBudget) {
      jobs = jobs.filter((job) => {
        const budgetMatch = job.budget.match(/\$(\d+)/);
        if (!budgetMatch) return false;

        const jobBudget = parseInt(budgetMatch[1]);
        const meetsMin = !minBudget || jobBudget >= parseInt(minBudget);
        const meetsMax = !maxBudget || jobBudget <= parseInt(maxBudget);

        return meetsMin && meetsMax;
      });
    }

    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
