import { getAllCommunes } from "vietnam-divisions-js/communes";
import { getAllDistricts } from "vietnam-divisions-js/districts";
import { getAllProvince } from "vietnam-divisions-js/provinces";

export type VietnamProvince = {
  id: string;
  name: string;
};

export type VietnamDistrict = {
  id: string;
  provinceId: string;
  name: string;
};

export type VietnamWard = {
  id: string;
  districtId: string;
  name: string;
};

export type VietnamAddressData = {
  provinces: VietnamProvince[];
  districts: VietnamDistrict[];
  wards: VietnamWard[];
};

function formatProvinceName(name: string) {
  if (name === "Thành phố Hồ Chí Minh") return "TP. Hồ Chí Minh";
  return name.replace(/^Thành phố\s+/i, "").replace(/^Tỉnh\s+/i, "");
}

export async function fetchVietnamAddressData(): Promise<VietnamAddressData> {
  const [provinces, districts, wards] = await Promise.all([
    getAllProvince(),
    getAllDistricts(),
    getAllCommunes(),
  ]);

  return {
    provinces: provinces.map((province) => ({
      id: province.idProvince,
      name: formatProvinceName(province.name),
    })),
    districts: districts.map((district) => ({
      id: district.idDistrict,
      provinceId: district.idProvince,
      name: district.name,
    })),
    wards: wards.map((ward) => ({
      id: ward.idCommune,
      districtId: ward.idDistrict,
      name: ward.name,
    })),
  };
}
