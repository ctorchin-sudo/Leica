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
