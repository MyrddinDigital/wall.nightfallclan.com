/// <reference path="./.sst/platform/config.d.ts" />
export default $config({
  app(input) {
    return {
      name: "nightfallclan-com",
      removal: input.stage === "prod" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    new sst.aws.Nextjs("WallSite", {
      domain: {
        name: "nightfallclan.com",
        redirects: ["www.nightfallclan.com", "wall.nightfallclan.com"]
      },
    });
  },
});
