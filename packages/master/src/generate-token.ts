import { SignJWT } from "jose";
import "dotenv/config";

const nodeId = process.argv[2];
if (!nodeId) {
  console.error("Usage: node generate-token.js <nodeId>");
  process.exit(1);
}

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  console.error("JWT_SECRET environment variable is required");
  process.exit(1);
}

const secret = new TextEncoder().encode(jwtSecret);
const token = await new SignJWT({ nodeId })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .sign(secret);

console.log(`\nToken generated for node: ${nodeId}`);
console.log(`\n${token}\n`);
console.log("Add this to your node-agent .env file:");
console.log(`NODE_TOKEN=${token}`);
