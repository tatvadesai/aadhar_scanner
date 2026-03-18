import Scanner from "@/components/Scanner";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center py-8 px-4">
      <h1 className="text-2xl font-bold mb-2">Aadhaar Scanner</h1>
      <p className="text-gray-400 text-sm mb-6">Powered by SmolVLM · runs fully on-device</p>
      <Scanner />
    </main>
  );
}
