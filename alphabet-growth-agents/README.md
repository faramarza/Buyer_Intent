# Alphabet Growth Agents

Multi-agent growth intelligence system for Alphabet Trains & Toys. Monitors community posts for buyer intent, content opportunities, competitive intelligence, and product insights.

## Setup

```bash
npm install
cp .env.example .env
# Add your Anthropic API key to .env
```

## Run

```bash
npm start
```

## Architecture

1. Sample posts are loaded
2. The orchestrator agent decides which specialists to activate per post
3. Selected specialist agents analyze the post in parallel
4. Results are combined per post
5. A daily digest agent summarizes all findings ranked by revenue potential

## Agents

| Agent | Role |
|-------|------|
| Orchestrator | Routes posts to relevant specialist agents |
| Buyer Intent | Scores purchase intent 0-100, maps to product catalog |
| Content Opportunity | Identifies SEO, blog, FAQ, Pinterest, category-page gaps |
| Response Draft | Writes helpful, non-promotional community replies |
| Product Intelligence | Surfaces objections, missing info, trust concerns |
| Competitor Intelligence | Tracks mentions of Lovevery, Melissa & Doug, etc. |
| Daily Digest | Ranks all findings by revenue potential and ease |
