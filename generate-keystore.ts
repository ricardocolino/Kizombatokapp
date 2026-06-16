import forge from "node-forge";
import fs from "fs";
import path from "path";

async function main() {
  const keystoreName = "angochat.keystore";
  const alias = "angochat-alias";
  const password = "angochat123";
  const targetPath = path.join(process.cwd(), keystoreName);

  console.log("-----------------------------------------");
  console.log("ANGOCHAT ANDROID KEYSTORE GENERATOR");
  console.log("-----------------------------------------");
  console.log(`Generating a 2048-bit RSA keypair ...`);

  // 1. Generate Key Pair
  const keys = forge.pki.rsa.generateKeyPair(2048);
  console.log("✓ RSA Keypair generated successfully.");

  // 2. Create Self-Signed X.509 Certificate
  console.log(`Creating self-signed certificate ...`);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  
  // Set serial number (must be unique/numeric)
  cert.serialNumber = "1" + Math.floor(Math.random() * 1000000);
  
  // Validity: Today -> 25 Years from now (standard for Android publishing/signing)
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 25);

  const attrs = [
    { name: "commonName", value: "Ricardo Colino" },
    { name: "organizationName", value: "Angochat" },
    { name: "localityName", value: "Luanda" },
    { name: "stateOrProvinceName", value: "Luanda" },
    { name: "countryName", value: "AO" }
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  // Self-sign the TLS certificate with SHA-256
  console.log("Signing certificate with SHA-256...");
  cert.sign(keys.privateKey, forge.md.sha256.create());
  console.log("✓ Certificate signed.");

  // 3. Package as PKCS12 (standard format for Modern KeyStore / JKS replacements)
  console.log("Packaging into PKCS#12 container...");
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
    keys.privateKey,
    [cert],
    password,
    {
      friendlyName: alias,
      algorithm: "3des" // highly compatible standard algorithm for private keys
    }
  );

  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  const buffer = Buffer.from(p12Der, "binary");

  // 4. Write Keystore File
  console.log(`Saving keystore to: ${targetPath}`);
  
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
    console.log("Previous keystore file deleted.");
  }
  
  fs.writeFileSync(targetPath, buffer);
  
  console.log("-----------------------------------------");
  console.log("SUCCESS! Your Android Keystore was created!");
  console.log(`File Name: ${keystoreName}`);
  console.log(`File Size: ${fs.statSync(targetPath).size} bytes`);
  console.log(`Alias: ${alias}`);
  console.log(`Password: ${password}`);
  console.log("-----------------------------------------");
}

main().catch((err) => {
  console.error("Failed to generate keystore:", err);
});
