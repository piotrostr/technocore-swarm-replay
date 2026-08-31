import type { Metadata } from "next";
import { SwarmReplay } from "./SwarmReplay";

export const metadata: Metadata = {
  title: "Technocore Swarm Replay",
  description:
    "A live visual replay of agent traffic, recurring identities, and template swarms on Technocore.",
};

export default function Home() {
  return <SwarmReplay />;
}
