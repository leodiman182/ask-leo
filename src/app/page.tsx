import { ChatSection } from "@/components/sections/ChatSection";
import SpaceScene      from "@/components/three/SpaceScene";

export default function Home() {
  return (
    <main className="relative h-screen w-full overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <SpaceScene />
      </div>

      <div className="relative flex h-full items-center justify-center px-6">
        <ChatSection />
      </div>
    </main>
  );
}
