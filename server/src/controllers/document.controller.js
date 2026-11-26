import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import prisma from '../config/db.js';
import { env } from '../config/env.js';
import { isStaff } from '../config/roles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  BadRequest, EXPIRING_DAYS, compact, expiryStatus, idParam, optDate, optEnum, optInt, optString, userName,
} from '../services/fleet.js';

// Compliance documents (insurance, registration, licences, ...) for
// vehicles and drivers, with optional file attachments. Files live under
// UPLOAD_DIR/<organisationId>/ with random names and are only ever served
// through downloadDocument, which checks the caller may see them.

const KINDS = ['INSURANCE', 'REGISTRATION', 'INSPECTION_CERT', 'ROAD_LICENSE', 'DRIVER_LICENSE', 'PSV_BADGE', 'MEDICAL', 'OTHER'];

// Accepted files, recognised by their first bytes (not the name or the
// browser-supplied type).
const FILE_TYPES = [
  { mime: 'application/pdf', ext: '.pdf', magic: [0x25, 0x50, 0x44, 0x46] },
  { mime: 'image/png', ext: '.png', magic: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', ext: '.jpg', magic: [0xff, 0xd8, 0xff] },
];

const detectType = (buf) => FILE_TYPES.find((t) => t.magic.every((b, i) => buf[i] === b));

// Multipart parsing for the upload route: one file field named "file",
// kept in memory (bounded by uploadMaxBytes) until it has been checked.
export const uploadMiddleware = (req, res, next) => {
  multer({ storage: multer.memoryStorage(), limits: { fileSize: env.uploadMaxBytes, files: 1 } })
    .single('file')(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `File is too large (max ${Math.round(env.uploadMaxBytes / 1048576)} MB).` });
      }
      if (err) return res.status(400).json({ error: 'Could not read the uploaded file.' });
      next();
    });
};

const filePath = (orgId, key) => path.join(env.uploadDir, String(orgId), key);

const docInclude = {
  bus: { select: { id: true, licensePlate: true, make: true, model: true } },
  driver: { include: { user: { select: { firstName: true, lastName: true } } } },
};

function presentDocument(doc, now = new Date()) {
  const { storageKey, driver, ...rest } = doc;
  return {
    ...rest,
    hasFile: Boolean(storageKey),
    expiry: expiryStatus(doc.expiresAt, now),
    driver: driver && { id: driver.id, name: userName(driver.user) },
  };
}

// GET /admin/documents?entityType=&kind=&busId=&driverId=&expiringWithinDays=
export const listDocuments = asyncHandler(async (req, res) => {
  const within = optInt(req.query.expiringWithinDays, 'expiringWithinDays');
  const where = compact({
    entityType: optEnum(req.query.entityType, ['VEHICLE', 'DRIVER'], 'entityType') ?? undefined,
    kind: optEnum(req.query.kind, KINDS, 'kind') ?? undefined,
    busId: idParam(req.query.busId) ?? undefined,
    driverId: idParam(req.query.driverId) ?? undefined,
    expiresAt: within != null ? { lte: new Date(Date.now() + within * 86400000) } : undefined,
  });
  const docs = await prisma.document.findMany({
    where,
    include: docInclude,
    orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { id: 'desc' }],
    take: 1000,
  });
  const now = new Date();
  const items = docs.map((d) => presentDocument(d, now));
  res.json({
    documents: items,
    summary: {
      expired: items.filter((d) => d.expiry === 'EXPIRED').length,
      expiring: items.filter((d) => d.expiry === 'EXPIRING').length,
      valid: items.filter((d) => d.expiry === 'VALID' || d.expiry === 'NONE').length,
      expiringDays: EXPIRING_DAYS,
    },
  });
});

function documentFields(body) {
  return compact({
    kind: optEnum(body.kind, KINDS, 'Kind') ?? undefined,
    title: optString(body.title, { max: 120 }),
    number: optString(body.number, { max: 80 }),
    issuedAt: optDate(body.issuedAt, 'Issue date'),
    expiresAt: optDate(body.expiresAt, 'Expiry date'),
    notes: optString(body.notes, { max: 2000 }),
  });
}

// POST /admin/documents { entityType, busId | driverId, kind, ... }
export const createDocument = asyncHandler(async (req, res) => {
  const entityType = optEnum(req.body.entityType, ['VEHICLE', 'DRIVER'], 'entityType');
  const data = documentFields(req.body);
  if (!entityType) throw new BadRequest('entityType is required.');
  if (!data.kind) throw new BadRequest('Kind is required.');

  if (entityType === 'VEHICLE') {
    const busId = idParam(req.body.busId);
    const bus = busId && await prisma.bus.findUnique({ where: { id: busId } });
    if (!bus) return res.status(404).json({ error: 'Vehicle not found.' });
    data.busId = busId;
  } else {
    const driverId = idParam(req.body.driverId);
    const driver = driverId && await prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) return res.status(404).json({ error: 'Driver not found.' });
    data.driverId = driverId;
  }

  const doc = await prisma.document.create({
    data: { ...data, entityType, createdById: req.user.id },
    include: docInclude,
  });
  res.status(201).json({ document: presentDocument(doc) });
});

export const updateDocument = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const existing = id && await prisma.document.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Document not found.' });
  const doc = await prisma.document.update({ where: { id }, data: documentFields(req.body), include: docInclude });
  res.json({ document: presentDocument(doc) });
});

export const deleteDocument = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const existing = id && await prisma.document.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Document not found.' });
  await prisma.document.delete({ where: { id } });
  if (existing.storageKey) await fs.rm(filePath(existing.organizationId, existing.storageKey), { force: true });
  res.json({ message: 'Document deleted.' });
});

// POST /admin/documents/:id/file (multipart, field "file"): attach or
// replace the document's file.
export const uploadDocumentFile = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const existing = id && await prisma.document.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Document not found.' });
  if (!req.file?.buffer?.length) throw new BadRequest('Choose a file to upload.');

  const type = detectType(req.file.buffer);
  if (!type) throw new BadRequest('Only PDF, PNG and JPEG files can be uploaded.');

  const key = `${crypto.randomUUID()}${type.ext}`;
  const target = filePath(existing.organizationId, key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, req.file.buffer, { flag: 'wx' });

  const fileName = path.basename(req.file.originalname || `document${type.ext}`).replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  const doc = await prisma.document.update({
    where: { id },
    data: { storageKey: key, fileName, mimeType: type.mime, fileSize: req.file.size },
    include: docInclude,
  });
  if (existing.storageKey) await fs.rm(filePath(existing.organizationId, existing.storageKey), { force: true });
  res.json({ document: presentDocument(doc) });
});

// Staff see every document in their organisation; a driver sees their own
// documents and those of the vehicle they currently drive.
async function canSeeDocument(user, doc) {
  if (isStaff(user.role)) return true;
  if (user.role !== 'DRIVER') return false;
  const driver = await prisma.driver.findFirst({ where: { userId: user.id }, include: { buses: { select: { id: true } } } });
  if (!driver) return false;
  return doc.driverId === driver.id || driver.buses.some((b) => b.id === doc.busId);
}

// GET .../documents/:id/file — streams the file as a download.
export const downloadDocument = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const doc = id && await prisma.document.findUnique({ where: { id } });
  if (!doc || !doc.storageKey || !(await canSeeDocument(req.user, doc))) {
    return res.status(404).json({ error: 'File not found.' });
  }
  let data;
  try {
    data = await fs.readFile(filePath(doc.organizationId, doc.storageKey));
  } catch {
    return res.status(404).json({ error: 'File not found.' });
  }
  res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${doc.fileName || 'document'}"`);
  res.send(data);
});
