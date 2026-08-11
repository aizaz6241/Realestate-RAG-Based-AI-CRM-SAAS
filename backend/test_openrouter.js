require('dotenv').config();

async function testOpenRouter() {
  const models = [
    'nvidia/nemotron-3-nano-30b-a3b:free',
    'qwen/qwen3-coder:free',
    'meta-llama/llama-3.2-3b-instruct:free'
  ];

  const key = process.env.LOCAL_LLM_API_KEY || process.env.OPENROUTER_API_KEY;

  for (const model of models) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [{role: 'user', content: 'hello'}],
          temperature: 0.1
        })
      });
      const data = await res.text();
      console.log(`Model: ${model}, Status: ${res.status}`);
      if (res.status === 200) {
        console.log(`WORKING: ${model}`);
      } else {
        console.log(`FAILED: ${data.substring(0, 150)}`);
      }
    } catch (e) {
      console.error(`Model: ${model}, Error: ${e.message}`);
    }
  }
}

testOpenRouter();
