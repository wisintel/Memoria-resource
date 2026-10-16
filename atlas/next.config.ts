import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  devIndicators: {
    position: "bottom-right",
  },
};

export default withEve(nextConfig);
