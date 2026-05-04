
Exa
Use Exa through the Hack Club AI proxy to search the web, find similar pages, extract content from URLs and answer questions with live web context.

Closed beta

Exa access currently requires the enable_exa feature flag. DM @mahad on Slack if you need access.

Endpoints

POST /proxy/v1/exa/search
POST /proxy/v1/exa/findSimilar
POST /proxy/v1/exa/contents
POST /proxy/v1/exa/answer
These endpoints proxy Exa's API. Send the same JSON body you would send to Exa, but authenticate with your Hack Club AI API key instead of an Exa API key.

Authentication

Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
Search
Search the web for pages matching a query.


curl https://ai.hackclub.com/proxy/v1/exa/search \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Hack Club projects",
    "numResults": 5
  }'
Find Similar
Find pages similar to a given URL.


curl https://ai.hackclub.com/proxy/v1/exa/findSimilar \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://hackclub.com/",
    "numResults": 5
  }'
Contents
Extract page contents from URLs.


curl https://ai.hackclub.com/proxy/v1/exa/contents \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["https://hackclub.com/"]
  }'
Answer
Ask a question and get an answer grounded in web results.


curl https://ai.hackclub.com/proxy/v1/exa/answer \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is Hack Club?"
  }'
Streaming Answers
If Exa supports streaming for your request, pass "stream": true and read the response as server-sent events.


curl https://ai.hackclub.com/proxy/v1/exa/answer \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is Hack Club?",
    "stream": true
  }'
Billing
Exa usage counts toward your normal Hack Club AI daily spending limit. The proxy records Exa's costDollars.total value for each request.


