import fs from 'fs';
import readline from 'readline';

async function findUserInputs() {
  const fileStream = fs.createReadStream('C:/Users/dangk/.gemini/antigravity-ide/brain/cc56f88e-cd1c-4c6f-866a-0b1d22ce4e58/.system_generated/logs/transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const output = [];
  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'USER_INPUT') {
        output.push(`=== Step ${obj.step_index} (${obj.created_at}) ===\n${obj.content}\n`);
      }
    } catch (e) {}
  }
  fs.writeFileSync('C:/Users/dangk/.gemini/antigravity-ide/brain/cc56f88e-cd1c-4c6f-866a-0b1d22ce4e58/scratch/user_inputs.txt', output.join('\n'));
  console.log('Done!');
}

findUserInputs();
