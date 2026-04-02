import { Suspense } from "react";
import type { Metadata } from "next";
import WallView from "@ui/WallView";
import GroupBio from "@ui/GroupBio";

export const metadata: Metadata = {
  title: "Wall Archive | Nightfall Clan",
};

export default function WallPage() {
  return (
    <>
      <div className="wall-page-body">
        <Suspense>
          <WallView />
        </Suspense>
        <GroupBio />
      </div>
    </>
  );
}
