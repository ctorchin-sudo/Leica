import axios from "axios";

const BASE_URL = "/api";

export async function fetchLenses(params = {}) {
  const { data } = await axios.get(`${BASE_URL}/lenses`, { params });
  return data;
}

export async function fetchFilters() {
  const { data } = await axios.get(`${BASE_URL}/lenses/filters`);
  return data;
}

export async function fetchLiveLenses(params = {}) {
  const { data } = await axios.get(`${BASE_URL}/scrape`, { params });
  return data;
}

export async function fetchScrapeStatus() {
  const { data } = await axios.get(`${BASE_URL}/scrape/status`);
  return data;
}
