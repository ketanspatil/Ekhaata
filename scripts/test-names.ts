import { extractCustomerName, matchCustomerNameAgainstLedger } from "../src/utils/nameNormalizer";

const testCases = [
  "सुरेश पाटिल का हिसाब बताओ।",
  "Suresh Patil ka hisaab batao.",
  "Ramesh Kumar ko 500 rupaye ka udhaar likho.",
  "Amit Sharma ne 200 rupaye diye.",
  "Suresh Patil ka balance kitna hai?",
  "Ramesh ke naam par ek hazaar chhah sau rupaye jama karo.",
  "Bhaiya Suresh Patil ka hisaab dekhna",
  "Aaj Ramesh Kumar ko 500 rupaye udhaar likho",
  "Suresh Patil",
  "सुरेश पाटिल",
  "Kul kitna udhaar baaki hai?",
  "Dukaan ka hisaab batao",
];

for (const tc of testCases) {
  const extracted = extractCustomerName(tc);
  console.log(`Input: "${tc}"`);
  console.log(`Extracted Customer: "${extracted}"\n`);
}
