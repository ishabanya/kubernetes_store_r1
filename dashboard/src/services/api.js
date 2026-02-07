import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

export async function fetchStores() {
  const { data } = await api.get('/stores');
  return data;
}

export async function fetchStore(id) {
  const { data } = await api.get(`/stores/${id}`);
  return data;
}

export async function createStore(name, type = 'woocommerce', adminUser, adminPassword) {
  const body = { name, type };
  if (adminUser) body.adminUser = adminUser;
  if (adminPassword) body.adminPassword = adminPassword;
  const { data } = await api.post('/stores', body);
  return data;
}

export async function deleteStore(id) {
  const { data } = await api.delete(`/stores/${id}`);
  return data;
}

export async function fetchAuditLog(limit = 50) {
  const { data } = await api.get(`/stores/audit/log?limit=${limit}`);
  return data;
}

export async function healthCheck() {
  const { data } = await api.get('/health');
  return data;
}
