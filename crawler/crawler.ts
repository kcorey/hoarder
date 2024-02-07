import logger from "@remember/shared/logger";
import {
  ZCrawlLinkRequest,
  zCrawlLinkRequestSchema,
} from "@remember/shared/queues";
import { Job } from "bullmq";

import prisma from "@remember/db";

import metascraper from "metascraper";

const metascraperParser = metascraper([
  require("metascraper-description")(),
  require("metascraper-image")(),
  require("metascraper-logo-favicon")(),
  require("metascraper-title")(),
  require("metascraper-url")(),
]);

export default async function runCrawler(job: Job<ZCrawlLinkRequest, void>) {
  const jobId = job.id || "unknown";

  const request = zCrawlLinkRequestSchema.safeParse(job.data);
  if (!request.success) {
    logger.error(
      `[Crawler][${jobId}] Got malformed job request: ${request.error.toString()}`,
    );
    return;
  }

  const { url, linkId } = request.data;

  logger.info(
    `[Crawler][${jobId}] Will crawl "${url}" for link with id "${linkId}"`,
  );
  // TODO(IMPORTANT): Run security validations on the input URL (e.g. deny localhost, etc)

  const resp = await fetch(url);
  const respBody = await resp.text();

  const meta = await metascraperParser({
    url,
    html: respBody,
  });

  await prisma.bookmarkedLink.update({
    where: {
      id: linkId,
    },
    data: {
      details: {
        upsert: {
          create: {
            title: meta.title,
            description: meta.description,
            imageUrl: meta.image,
            favicon: meta.logo,
          },
          update: {
            title: meta.title,
            description: meta.description,
            imageUrl: meta.image,
            favicon: meta.logo,
          },
        },
      },
    },
    include: {
      details: true,
    },
  });
}