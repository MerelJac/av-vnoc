-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('POLY_LENS', 'YEALINK_YMCS', 'NEAT_PULSE', 'LOGITECH_SYNC', 'CISCO_CONTROL_HUB', 'UTELOGY');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'AUTO_RESOLVED', 'SUPPRESSED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('P1', 'P2', 'P3', 'P4');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "VnocRole" AS ENUM ('TIER1', 'TIER2', 'MANAGER');

-- CreateEnum
CREATE TYPE "AlertGroupType" AS ENUM ('ROOM_OUTAGE', 'SITE_OUTAGE', 'DEVICE_FAULT');

-- CreateEnum
CREATE TYPE "TicketActionType" AS ENUM ('NOTE', 'REBOOT', 'FIRMWARE_PUSH', 'ESCALATE', 'STATUS_CHANGE', 'CONFIG_RESTORE');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "vnocRole" "VnocRole";

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "roomId" TEXT,
    "platform" "Platform" NOT NULL,
    "platformId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT,
    "firmware" TEXT,
    "ipAddress" TEXT,
    "macAddress" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "lastSeenAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertGroup" (
    "id" TEXT NOT NULL,
    "type" "AlertGroupType" NOT NULL,
    "customerId" TEXT,
    "siteId" TEXT,
    "roomId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "platformAlertId" TEXT NOT NULL,
    "deviceId" TEXT,
    "roomId" TEXT,
    "groupId" TEXT,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "rawPayload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "autoCloseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "customerId" TEXT,
    "assignedTo" TEXT,
    "priority" "TicketPriority" NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "rootCause" TEXT,
    "resolution" TEXT,
    "slaDeadline" TIMESTAMP(3) NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAction" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "TicketActionType" NOT NULL,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "platform" "Platform",
    "userId" TEXT,
    "alertId" TEXT,
    "ticketId" TEXT,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformCredential" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "apiKey" TEXT,
    "webhookSecret" TEXT,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Site_customerId_idx" ON "Site"("customerId");

-- CreateIndex
CREATE INDEX "Room_siteId_idx" ON "Room"("siteId");

-- CreateIndex
CREATE INDEX "Device_roomId_idx" ON "Device"("roomId");

-- CreateIndex
CREATE INDEX "Device_platform_idx" ON "Device"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "Device_platform_platformId_key" ON "Device"("platform", "platformId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_platform_eventId_key" ON "WebhookEvent"("platform", "eventId");

-- CreateIndex
CREATE INDEX "AlertGroup_customerId_idx" ON "AlertGroup"("customerId");

-- CreateIndex
CREATE INDEX "AlertGroup_siteId_idx" ON "AlertGroup"("siteId");

-- CreateIndex
CREATE INDEX "AlertGroup_roomId_idx" ON "AlertGroup"("roomId");

-- CreateIndex
CREATE INDEX "Alert_status_idx" ON "Alert"("status");

-- CreateIndex
CREATE INDEX "Alert_deviceId_idx" ON "Alert"("deviceId");

-- CreateIndex
CREATE INDEX "Alert_roomId_idx" ON "Alert"("roomId");

-- CreateIndex
CREATE INDEX "Alert_groupId_idx" ON "Alert"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_platform_platformAlertId_key" ON "Alert"("platform", "platformAlertId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_alertId_key" ON "Ticket"("alertId");

-- CreateIndex
CREATE INDEX "Ticket_assignedTo_idx" ON "Ticket"("assignedTo");

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");

-- CreateIndex
CREATE INDEX "Ticket_customerId_idx" ON "Ticket"("customerId");

-- CreateIndex
CREATE INDEX "TicketAction_ticketId_idx" ON "TicketAction"("ticketId");

-- CreateIndex
CREATE INDEX "ActivityLog_alertId_idx" ON "ActivityLog"("alertId");

-- CreateIndex
CREATE INDEX "ActivityLog_ticketId_idx" ON "ActivityLog"("ticketId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformCredential_platform_key" ON "PlatformCredential"("platform");

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertGroup" ADD CONSTRAINT "AlertGroup_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertGroup" ADD CONSTRAINT "AlertGroup_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertGroup" ADD CONSTRAINT "AlertGroup_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AlertGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAction" ADD CONSTRAINT "TicketAction_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAction" ADD CONSTRAINT "TicketAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
