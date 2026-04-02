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
    const wallDomain = "wall.nightfallclan.com";
    const wallDestination = "https://nightfallclan.com/wall";

    const wallRedirect = new sst.aws.Router("WallRedirect", {
      domain: wallDomain,
      edge: {
        viewerRequest: {
          injection: `
            const host = event.request?.headers?.host?.value;
            if (host === "${wallDomain}") {
              return {
                statusCode: 308,
                statusDescription: "Permanent Redirect",
                headers: {
                  location: { value: "${wallDestination}" }
                }
              };
            }
          `,
        },
      },
    });
    wallRedirect.route("/", wallDestination);

    new sst.aws.Nextjs("WallSite", {
      domain: {
        name: "nightfallclan.com",
        redirects: ["www.nightfallclan.com", "wall.nightfallclan.com"]
      },
    });
  },
});
