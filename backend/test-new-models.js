const geminiKey = "AIzaSyCdF2d3e1Sc4mb4QGR8WRquqYyAIpNMcmQ";

async function testEmbedding(model) {
  console.log(`\nTesting embedding model: ${model}`);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${model}`,
          content: { parts: [{ text: 'Hello world' }] },
        }),
      }
    );
    console.log(`${model} Status:`, response.status);
    const data = await response.json();
    if (response.ok) {
      console.log(`${model} Success! Vector length:`, data.embedding.values.length);
      return true;
    } else {
      console.error(`${model} Error:`, JSON.stringify(data));
      return false;
    }
  } catch (err) {
    console.error(`${model} Exception:`, err.message);
    return false;
  }
}

async function testGeneration(model) {
  console.log(`\nTesting generation model: ${model}`);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Explain AI in three words' }] }]
        }),
      }
    );
    console.log(`${model} Status:`, response.status);
    const data = await response.json();
    if (response.ok) {
      console.log(`${model} Success! Response:`, data.candidates[0].content.parts[0].text);
      return true;
    } else {
      console.error(`${model} Error:`, JSON.stringify(data));
      return false;
    }
  } catch (err) {
    console.error(`${model} Exception:`, err.message);
    return false;
  }
}

async function run() {
  await testEmbedding('gemini-embedding-001');
  await testEmbedding('gemini-embedding-2');
  
  await testGeneration('gemini-2.0-flash');
  await testGeneration('gemini-3.5-flash');
  await testGeneration('gemini-flash-latest');
}

run();
