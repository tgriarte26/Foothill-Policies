

Readme · MD
Polysees — AI Policy Management System
An AI-powered system that makes college policies easy to find, manage, and track. Built in one week at the AWS AI Summer Camp 2026 (Cal Poly San Luis Obispo) to solve a real problem for Foothill De Anza College.

The Problem
Foothill De Anza's policy system was disorganized: students and faculty had to search through hundreds of PDFs to find answers, and policies moving through approval had no tracking system. What should take minutes took months.

Our Solution
A two-part system:

1. Policy Chatbot (RAG)
Ask a question in plain language and get a direct answer pulled straight from the source policy — with citations — instead of digging through documents.

A custom web scraper collects policy pages from the college site
Raw text is stored in an S3 bucket
AWS Bedrock turns it into a searchable knowledge base
On each question, matching policy chunks are retrieved and Nova Pro generates a grounded answer with sources attached (retrieval-augmented generation)
2. Faculty Dashboard
A management interface for the full policy lifecycle:

Upload legal-update documents (converted to text in-browser with mammoth.js)
Rule-based parsing (regex + keywords) sorts and tags each policy
Track new or outdated policies through approval
Runs on AWS Lambda, S3, and DynamoDB
Result: a policy process that took months now takes under an hour.

Tech Stack
Layer	Tools
AI / ML	AWS Bedrock, Nova Pro, RAG
Backend	AWS Lambda, S3, DynamoDB, API Gateway
Frontend	<!-- TODO: confirm — e.g. React / plain JS / HTML+CSS -->, mammoth.js
Data	Custom web scraper with Python and Beautiful Soup
Repo Structure
Foothill-Policies/
├── backend/     # Lambda functions, API, data pipeline, RAG
├── frontend/    # Dashboard + Landing Page with chatbot UI
└── .gitignore
Project Status
This was built during a one-week camp on temporary AWS accounts. The AWS credentials expire after the session, so the chatbot (which depends on Bedrock, Lambda, and the knowledge base) is no longer live.

You can still run the faculty dashboard locally to explore the UI and the policy-management workflow — the upload, parsing, and tagging features work in-browser without AWS.

Getting Started (Local Dashboard)
bash
# Clone the repo
git clone https://github.com/tgriarte26/Foothill-Policies.git
cd Foothill-Policies/frontend

# Install dependencies and start the local dev server
npm install
npm start
Then open http://localhost:8080 in your browser.

Note: The chatbot half of the system requires live AWS resources (Bedrock, Nova Pro, S3, DynamoDB) that are no longer provisioned. The code remains in this repo as a reference for how the RAG pipeline was built.

Team
Built by Trevor Griarte, Huseyin Gokturk, Grace Jia, Elina Novikova, and Jaime Gomez

Mentored by Shrey Shah.

Acknowledgments
Created at the AWS AI Summer Camp 2026 at California Polytechnic State University, San Luis Obispo.


