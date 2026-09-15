import * as local from "./store";
import * as cloud from "./cloud-store";
import type { CapabilitySectionKey, TenderWorkflowStatus } from "./types";

const useCloud = process.env.DATA_BACKEND === "supabase";

export const readSnapshot = (options: Parameters<typeof local.getSnapshot>[0] = {}) => useCloud ? cloud.cloudSnapshot(options) : Promise.resolve(local.getSnapshot(options));
export const readTender = (id: string) => useCloud ? cloud.cloudTender(id) : Promise.resolve(local.getTender(id));
export const readTenderDeliveryPlan = (id: string) => useCloud ? cloud.cloudDeliveryPlan(id) : Promise.resolve(local.getTenderDeliveryPlan(id));
export const updateTenderDelivery = (tenderId: string, allocationId: string, patch: Record<string, unknown>) => useCloud ? cloud.cloudUpdateDelivery(tenderId, allocationId, patch) : Promise.resolve(local.updateTenderDeliveryAllocation(tenderId, allocationId, patch));
export const readCapabilities = () => useCloud ? cloud.cloudCapabilities() : Promise.resolve(local.getCapabilities());
export const readCapabilityVersions = () => useCloud ? cloud.cloudCapabilityVersions() : Promise.resolve(local.getCapabilityVersions());
export const updateCompanyData = (next: Parameters<typeof local.updateCompany>[0]) => useCloud ? cloud.cloudUpdateCompany(next) : Promise.resolve(local.updateCompany(next));
export const updateCapabilityData = (section: CapabilitySectionKey, payload: Record<string, unknown>) => useCloud ? cloud.cloudUpdateCapabilitySection(section, payload) : Promise.resolve(local.updateCapabilitySection(section, payload));
export const activateCapabilityData = () => useCloud ? cloud.cloudActivateCapabilities() : Promise.resolve(local.activateCapabilities());
export const recordTenderFeedback = (tenderId: string, relevant: boolean) => useCloud ? cloud.cloudFeedback(tenderId, relevant) : Promise.resolve(local.recordFeedback(tenderId, relevant));
export const updateWorkflowData = (tenderId: string, status: TenderWorkflowStatus) => useCloud ? cloud.cloudWorkflow(tenderId, status) : Promise.resolve(local.updateTenderWorkflow(tenderId, status));
export const queueBulletinData = (fileName: string, buffer: Buffer) => useCloud ? cloud.cloudQueueBulletin(fileName, buffer) : Promise.resolve(local.queueBulletin(fileName, buffer));
export const processBulletinData = (id: string) => useCloud ? cloud.cloudProcessBulletin(id) : local.processBulletin(id);
export const requestBulletinProcessingData = (id: string) => useCloud ? cloud.cloudRequestBulletinProcessing(id) : Promise.resolve(local.requestBulletinProcessing(id));
export const removeBulletinData = (id: string) => useCloud ? cloud.cloudRemoveBulletin(id) : Promise.resolve(local.removeBulletin(id));
export const readBulletinFile = (id: string) => useCloud ? cloud.cloudBulletinFile(id) : Promise.resolve((() => { const buffer = local.getBulletinFile(id); const bulletin = local.getSnapshot().bulletins.find((item) => item.id === id); return buffer && bulletin ? { buffer, fileName: bulletin.fileName } : null; })());
export const addCapabilityDocumentData = (...args: Parameters<typeof local.addCapabilityDocument>) => useCloud ? cloud.cloudAddCapabilityDocument(...args) : Promise.resolve(local.addCapabilityDocument(...args));
export const readCapabilityDocument = (id: string) => useCloud ? cloud.cloudCapabilityDocument(id) : Promise.resolve(local.getCapabilityDocument(id));
export const removeCapabilityDocumentData = (id: string) => useCloud ? cloud.cloudRemoveCapabilityDocument(id) : Promise.resolve(local.removeCapabilityDocument(id));
