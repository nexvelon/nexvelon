import type { Product } from "../types";

export const products: Product[] = [
  // Kantech access control (ADI)
  { id: "p-001", sku: "KT-400", name: "Kantech KT-400 4-Door Ethernet Controller", manufacturer: "Kantech", category: "Access Control", vendor: "ADI", cost: 1295.0, price: 1820.0, stock: 14, reorderPoint: 6 },
  { id: "p-002", sku: "KT-300", name: "Kantech KT-300 2-Door IP Controller", manufacturer: "Kantech", category: "Access Control", vendor: "ADI", cost: 845.0, price: 1180.0, stock: 22, reorderPoint: 8 },
  { id: "p-003", sku: "P225XSF", name: "Kantech ioSmart Multi-Tech Reader Mullion", manufacturer: "Kantech", category: "Access Control", vendor: "ADI", cost: 215.0, price: 309.0, stock: 48, reorderPoint: 20 },
  { id: "p-004", sku: "P325XSF", name: "Kantech ioSmart Multi-Tech Reader Single Gang", manufacturer: "Kantech", category: "Access Control", vendor: "ADI", cost: 235.0, price: 339.0, stock: 36, reorderPoint: 15 },

  // Genetec
  { id: "p-005", sku: "GSC-OM-E1", name: "Genetec Security Center Omnicast Camera Conn 1ch", manufacturer: "Genetec", category: "CCTV", vendor: "Anixter", cost: 195.0, price: 269.0, stock: 80, reorderPoint: 30 },
  { id: "p-006", sku: "GSC-SY-E", name: "Genetec Security Center Synergis Reader Connection", manufacturer: "Genetec", category: "Access Control", vendor: "Anixter", cost: 165.0, price: 229.0, stock: 64, reorderPoint: 25 },
  { id: "p-007", sku: "SY-CLOUDLINK-534", name: "Genetec Cloudlink 534 Appliance", manufacturer: "Genetec", category: "Networking", vendor: "Anixter", cost: 2150.0, price: 2890.0, stock: 6, reorderPoint: 3 },

  // Avigilon
  { id: "p-008", sku: "5.0L-H6A-DO1-IR", name: "Avigilon H6A 5MP Outdoor Dome IR", manufacturer: "Avigilon", category: "CCTV", vendor: "Anixter", cost: 825.0, price: 1145.0, stock: 28, reorderPoint: 12 },
  { id: "p-009", sku: "8.0C-H6A-BO1-IR", name: "Avigilon H6A 8MP Outdoor Bullet IR", manufacturer: "Avigilon", category: "CCTV", vendor: "Anixter", cost: 945.0, price: 1310.0, stock: 18, reorderPoint: 8 },
  { id: "p-010", sku: "VMA-AS3-16P8", name: "Avigilon AI NVR 3 Premium 16-Port 8TB", manufacturer: "Avigilon", category: "CCTV", vendor: "Anixter", cost: 4650.0, price: 6320.0, stock: 4, reorderPoint: 2 },
  { id: "p-011", sku: "ACC7-ENT", name: "Avigilon Control Center 7 Enterprise License", manufacturer: "Avigilon", category: "CCTV", vendor: "Anixter", cost: 285.0, price: 395.0, stock: 60, reorderPoint: 20 },

  // DSC intrusion
  { id: "p-012", sku: "HS2128", name: "DSC PowerSeries Neo HS2128 Control Panel", manufacturer: "DSC", category: "Intrusion", vendor: "ADI", cost: 285.0, price: 405.0, stock: 26, reorderPoint: 10 },
  { id: "p-013", sku: "HS2LCDRF9", name: "DSC PowerSeries Neo LCD RF Keypad", manufacturer: "DSC", category: "Intrusion", vendor: "ADI", cost: 165.0, price: 235.0, stock: 42, reorderPoint: 18 },
  { id: "p-014", sku: "PG9914", name: "DSC PowerG Wireless PIR Motion Detector", manufacturer: "DSC", category: "Intrusion", vendor: "ADI", cost: 78.0, price: 119.0, stock: 95, reorderPoint: 40 },
  { id: "p-015", sku: "PG9945", name: "DSC PowerG Wireless Door/Window Contact", manufacturer: "DSC", category: "Intrusion", vendor: "ADI", cost: 42.0, price: 65.0, stock: 140, reorderPoint: 60 },

  // Hanwha
  { id: "p-016", sku: "PNV-A9081R", name: "Hanwha Wisenet 4K AI IR Vandal Dome", manufacturer: "Hanwha", category: "CCTV", vendor: "ADI", cost: 765.0, price: 1059.0, stock: 22, reorderPoint: 10 },
  { id: "p-017", sku: "PNO-A9081R", name: "Hanwha Wisenet 4K AI IR Bullet", manufacturer: "Hanwha", category: "CCTV", vendor: "ADI", cost: 745.0, price: 1029.0, stock: 17, reorderPoint: 8 },
  { id: "p-018", sku: "WRN-1610S-32TB", name: "Hanwha Wisenet 16ch NVR 32TB", manufacturer: "Hanwha", category: "CCTV", vendor: "ADI", cost: 3850.0, price: 5290.0, stock: 5, reorderPoint: 2 },
  { id: "p-019", sku: "QNV-C8011", name: "Hanwha Wisenet 5MP IR Vandal Dome", manufacturer: "Hanwha", category: "CCTV", vendor: "ADI", cost: 365.0, price: 519.0, stock: 38, reorderPoint: 15 },

  // ICT Protege
  { id: "p-020", sku: "PRT-CTRL-DIN", name: "ICT Protege GX Controller DIN", manufacturer: "ICT", category: "Access Control", vendor: "Anixter", cost: 1685.0, price: 2310.0, stock: 8, reorderPoint: 4 },
  { id: "p-021", sku: "PRT-RDM2-DIN", name: "ICT Protege Reader Expander Module", manufacturer: "ICT", category: "Access Control", vendor: "Anixter", cost: 545.0, price: 749.0, stock: 16, reorderPoint: 8 },
  { id: "p-022", sku: "PRT-RDR-MFC", name: "ICT tSec Mini Reader MIFARE", manufacturer: "ICT", category: "Access Control", vendor: "Anixter", cost: 195.0, price: 279.0, stock: 52, reorderPoint: 20 },

  // Hartmann (specialty doors / man-traps)
  { id: "p-023", sku: "PILOMAT-275-A", name: "Hartmann Pilomat 275/A Bollard", manufacturer: "Hartmann", category: "Access Control", vendor: "Wesco", cost: 12450.0, price: 16800.0, stock: 2, reorderPoint: 1 },
  { id: "p-024", sku: "MANTRAP-MTP-3", name: "Hartmann MTP-3 Single-Person Mantrap", manufacturer: "Hartmann", category: "Access Control", vendor: "Wesco", cost: 28500.0, price: 38900.0, stock: 1, reorderPoint: 1 },

  // Keyscan (legacy access)
  { id: "p-025", sku: "EC2-MINI", name: "Keyscan EC2 Mini Door Controller", manufacturer: "Keyscan", category: "Access Control", vendor: "ADI", cost: 595.0, price: 819.0, stock: 12, reorderPoint: 5 },
  { id: "p-026", sku: "K-PROX3", name: "Keyscan K-PROX3 Proximity Reader", manufacturer: "Keyscan", category: "Access Control", vendor: "ADI", cost: 165.0, price: 229.0, stock: 24, reorderPoint: 10 },

  // C•CURE (Software House)
  { id: "p-027", sku: "CC9000-BASE", name: "C-CURE 9000 Base License v3.1", manufacturer: "C-CURE", category: "Access Control", vendor: "Anixter", cost: 4200.0, price: 5680.0, stock: 6, reorderPoint: 2 },
  { id: "p-028", sku: "iSTAR-EDGE-G2", name: "C-CURE iSTAR Edge G2 4-Reader", manufacturer: "C-CURE", category: "Access Control", vendor: "Anixter", cost: 2685.0, price: 3640.0, stock: 5, reorderPoint: 2 },

  // Lenel
  { id: "p-029", sku: "LNL-X4220", name: "Lenel LNL-X4220 4-Reader Intelligent Controller", manufacturer: "Lenel", category: "Access Control", vendor: "Anixter", cost: 2850.0, price: 3890.0, stock: 4, reorderPoint: 2 },
  { id: "p-030", sku: "LNL-1300", name: "Lenel LNL-1300 Single Reader Interface", manufacturer: "Lenel", category: "Access Control", vendor: "Anixter", cost: 485.0, price: 669.0, stock: 14, reorderPoint: 6 },

  // Axis
  { id: "p-031", sku: "P3267-LV", name: "Axis P3267-LV 5MP Indoor Dome", manufacturer: "Axis", category: "CCTV", vendor: "CDW", cost: 685.0, price: 945.0, stock: 30, reorderPoint: 12 },
  { id: "p-032", sku: "M3215-LVE", name: "Axis M3215-LVE 2MP Outdoor Dome", manufacturer: "Axis", category: "CCTV", vendor: "CDW", cost: 365.0, price: 519.0, stock: 44, reorderPoint: 18 },
  { id: "p-033", sku: "Q6225-LE", name: "Axis Q6225-LE 1080p PTZ", manufacturer: "Axis", category: "CCTV", vendor: "CDW", cost: 3250.0, price: 4420.0, stock: 6, reorderPoint: 3 },
  { id: "p-034", sku: "A1601", name: "Axis A1601 Network Door Controller", manufacturer: "Axis", category: "Access Control", vendor: "CDW", cost: 545.0, price: 749.0, stock: 18, reorderPoint: 8 },
  { id: "p-035", sku: "C1310-E", name: "Axis C1310-E Outdoor Network Speaker", manufacturer: "Axis", category: "Intercom", vendor: "CDW", cost: 425.0, price: 589.0, stock: 22, reorderPoint: 10 },

  // Uniview
  { id: "p-036", sku: "IPC3618SR3-DPF28M", name: "Uniview 8MP Mini Dome 2.8mm", manufacturer: "Uniview", category: "CCTV", vendor: "ADI", cost: 285.0, price: 405.0, stock: 56, reorderPoint: 20 },
  { id: "p-037", sku: "NVR308-32E2-IF", name: "Uniview 32ch NVR with Face Recognition", manufacturer: "Uniview", category: "CCTV", vendor: "ADI", cost: 1485.0, price: 2049.0, stock: 7, reorderPoint: 3 },
  { id: "p-038", sku: "IPC2128SB-ADF28KMC", name: "Uniview 8MP LightHunter Mini Bullet", manufacturer: "Uniview", category: "CCTV", vendor: "ADI", cost: 325.0, price: 459.0, stock: 38, reorderPoint: 15 },

  // Vivotek
  { id: "p-039", sku: "FD9387-EHTV-A", name: "Vivotek 5MP H.265 IR Outdoor Dome", manufacturer: "Vivotek", category: "CCTV", vendor: "Wesco", cost: 425.0, price: 589.0, stock: 26, reorderPoint: 10 },
  { id: "p-040", sku: "IB9389-EHT-A", name: "Vivotek 5MP H.265 SNV WDR Bullet", manufacturer: "Vivotek", category: "CCTV", vendor: "Wesco", cost: 445.0, price: 615.0, stock: 21, reorderPoint: 9 },
  { id: "p-041", sku: "ND9442P", name: "Vivotek 16ch H.265 PoE NVR", manufacturer: "Vivotek", category: "CCTV", vendor: "Wesco", cost: 1185.0, price: 1640.0, stock: 8, reorderPoint: 4 },

  // Networking & power & cabling (mixed)
  { id: "p-042", sku: "CS-360X-24P", name: "Cisco Catalyst 9300 24-Port PoE+ Switch", manufacturer: "Axis", category: "Networking", vendor: "CDW", cost: 5285.0, price: 7240.0, stock: 4, reorderPoint: 2 },
  { id: "p-043", sku: "ALTV1224300CB", name: "Altronix 12/24V 12A CCTV Power", manufacturer: "DSC", category: "Power", vendor: "ADI", cost: 195.0, price: 279.0, stock: 38, reorderPoint: 15 },
  { id: "p-044", sku: "ALTV248UL3", name: "Altronix 24V 8A Multi-Output Power", manufacturer: "DSC", category: "Power", vendor: "ADI", cost: 245.0, price: 339.0, stock: 30, reorderPoint: 12 },
  { id: "p-045", sku: "C6-1000-BLU", name: "CommScope CAT6 1000ft Riser Blue", manufacturer: "Axis", category: "Cabling", vendor: "Wesco", cost: 145.0, price: 209.0, stock: 84, reorderPoint: 30 },
  { id: "p-046", sku: "C6A-1000-WHT", name: "CommScope CAT6A 1000ft Plenum White", manufacturer: "Axis", category: "Cabling", vendor: "Wesco", cost: 425.0, price: 589.0, stock: 42, reorderPoint: 18 },

  // Intercoms
  { id: "p-047", sku: "AXIS-A8207-VE", name: "Axis A8207-VE Network Video Door Station", manufacturer: "Axis", category: "Intercom", vendor: "CDW", cost: 1085.0, price: 1495.0, stock: 11, reorderPoint: 5 },
  { id: "p-048", sku: "I8MX-RDR", name: "ICT tSec Touch MIFARE Intercom Reader", manufacturer: "ICT", category: "Intercom", vendor: "Anixter", cost: 565.0, price: 779.0, stock: 14, reorderPoint: 6 },
  { id: "p-049", sku: "VV-DB7-COL", name: "Vivotek DB7 Outdoor Doorbell Station", manufacturer: "Vivotek", category: "Intercom", vendor: "Wesco", cost: 385.0, price: 535.0, stock: 18, reorderPoint: 8 },
  { id: "p-050", sku: "GENETEC-INT-1CH", name: "Genetec Sipelia Intercom Endpoint License", manufacturer: "Genetec", category: "Intercom", vendor: "Anixter", cost: 195.0, price: 269.0, stock: 50, reorderPoint: 20 },

  { id: "p-051", sku: "KT-1", name: "Kantech KT-1 1-Door IP Controller", manufacturer: "Kantech", category: "Access Control", vendor: "ADI", cost: 545.0, price: 759.0, stock: 18, reorderPoint: 8, reorderQty: 12, upc: "065477012004", lastReceived: "2026-04-08" },
  { id: "p-052", sku: "KT-MOD-IO16", name: "Kantech KT-MOD-IO16 16-Input Expander", manufacturer: "Kantech", category: "Access Control", vendor: "ADI", cost: 285.0, price: 395.0, stock: 9, reorderPoint: 4, reorderQty: 8, lastReceived: "2026-03-22" },
  { id: "p-053", sku: "K-PROX5", name: "Keyscan Aurora K-PROX5 Multi-Tech Reader", manufacturer: "Keyscan", category: "Access Control", vendor: "ADI", cost: 195.0, price: 275.0, stock: 32, reorderPoint: 12, reorderQty: 24, lastReceived: "2026-04-02" },
  { id: "p-054", sku: "PRT-CTRL-WX", name: "ICT Protege WX Integrated Controller", manufacturer: "ICT", category: "Access Control", vendor: "Anixter", cost: 985.0, price: 1349.0, stock: 6, reorderPoint: 3, reorderQty: 6 },
  { id: "p-055", sku: "PRT-PSU-DIN-2A", name: "ICT Protege 2A Power Supply DIN", manufacturer: "ICT", category: "Power", vendor: "Anixter", cost: 195.0, price: 269.0, stock: 22, reorderPoint: 10, reorderQty: 20 },
  { id: "p-056", sku: "SY-CLOUDLINK-322", name: "Genetec Synergis Cloud Link 322", manufacturer: "Genetec", category: "Access Control", vendor: "Anixter", cost: 1685.0, price: 2295.0, stock: 5, reorderPoint: 2, reorderQty: 4 },
  { id: "p-057", sku: "5.0L-H5A-DO1", name: "Avigilon H5A 5MP Indoor Dome", manufacturer: "Avigilon", category: "CCTV", vendor: "Anixter", cost: 685.0, price: 949.0, stock: 24, reorderPoint: 12, reorderQty: 24 },
  { id: "p-058", sku: "3.0C-H5A-FE-DO1", name: "Avigilon H5A 3MP Fisheye Dome", manufacturer: "Avigilon", category: "CCTV", vendor: "Anixter", cost: 945.0, price: 1310.0, stock: 8, reorderPoint: 4, reorderQty: 8 },
  { id: "p-059", sku: "CC9000-RDR-PACK", name: "C-CURE 9000 Reader License Pack 25", manufacturer: "C-CURE", category: "Access Control", vendor: "Anixter", cost: 1850.0, price: 2540.0, stock: 4, reorderPoint: 2, reorderQty: 3 },
  { id: "p-060", sku: "HS2032", name: "DSC PowerSeries Neo HS2032 Control Panel", manufacturer: "DSC", category: "Intrusion", vendor: "ADI", cost: 215.0, price: 305.0, stock: 19, reorderPoint: 8, reorderQty: 18 },
  { id: "p-061", sku: "PG9929", name: "DSC PowerG Wireless Glass Break Detector", manufacturer: "DSC", category: "Intrusion", vendor: "ADI", cost: 95.0, price: 145.0, stock: 62, reorderPoint: 24, reorderQty: 48 },
  { id: "p-062", sku: "PG9985", name: "DSC PowerG Wireless Smoke + Heat Detector", manufacturer: "DSC", category: "Intrusion", vendor: "ADI", cost: 142.0, price: 209.0, stock: 38, reorderPoint: 18, reorderQty: 36 },
  { id: "p-063", sku: "QND-7080R", name: "Hanwha Wisenet 4MP IR Indoor Dome", manufacturer: "Hanwha", category: "CCTV", vendor: "ADI", cost: 295.0, price: 419.0, stock: 41, reorderPoint: 18, reorderQty: 36 },
  { id: "p-064", sku: "FD9189-H", name: "Vivotek FD9189-H 5MP Indoor Dome H.265", manufacturer: "Vivotek", category: "CCTV", vendor: "Wesco", cost: 285.0, price: 405.0, stock: 27, reorderPoint: 12, reorderQty: 24 },
  { id: "p-065", sku: "IPC2125SR3-ADUPF40M-F", name: "Uniview 5MP IR Mini Bullet 4mm", manufacturer: "Uniview", category: "CCTV", vendor: "ADI", cost: 195.0, price: 275.0, stock: 54, reorderPoint: 20, reorderQty: 48 },
  { id: "p-066", sku: "P3245-LVE", name: "Axis P3245-LVE 2MP Outdoor Dome", manufacturer: "Axis", category: "CCTV", vendor: "CDW", cost: 595.0, price: 819.0, stock: 22, reorderPoint: 10, reorderQty: 18 },
  { id: "p-067", sku: "Q6135-LE", name: "Axis Q6135-LE 1080p PTZ Outdoor", manufacturer: "Axis", category: "CCTV", vendor: "CDW", cost: 4250.0, price: 5790.0, stock: 4, reorderPoint: 2, reorderQty: 4 },
  { id: "p-068", sku: "2N-IP-VERSO-2.0", name: "2N IP Verso 2.0 Intercom Module", manufacturer: "Axis", category: "Intercom", vendor: "Anixter", cost: 685.0, price: 945.0, stock: 14, reorderPoint: 6, reorderQty: 12 },
  { id: "p-069", sku: "FA-300", name: "Mircom FA-300 Single-Stage Fire Alarm Panel", manufacturer: "DSC", category: "Intrusion", vendor: "Wesco", cost: 1250.0, price: 1745.0, stock: 5, reorderPoint: 2, reorderQty: 4 },
  { id: "p-070", sku: "MIX-2351-EX", name: "Mircom MIX-2351 Photoelectric Smoke Detector", manufacturer: "DSC", category: "Intrusion", vendor: "Wesco", cost: 78.0, price: 119.0, stock: 84, reorderPoint: 36, reorderQty: 72 },
  { id: "p-071", sku: "ALTV2416300CB", name: "Altronix 24V 16A 16-Output Power Supply", manufacturer: "DSC", category: "Power", vendor: "ADI", cost: 425.0, price: 589.0, stock: 12, reorderPoint: 5, reorderQty: 10 },
  { id: "p-072", sku: "APC-SMT1500", name: "APC Smart-UPS 1500VA Rack 2U", manufacturer: "DSC", category: "Power", vendor: "CDW", cost: 685.0, price: 945.0, stock: 8, reorderPoint: 4, reorderQty: 8 },
  { id: "p-073", sku: "USW-PRO-48-POE", name: "Ubiquiti UniFi USW-Pro-48-PoE 48-Port Switch", manufacturer: "Axis", category: "Network", vendor: "CDW", cost: 1885.0, price: 2545.0, stock: 6, reorderPoint: 3, reorderQty: 6 },
  { id: "p-074", sku: "C9300-48UXM", name: "Cisco Catalyst 9300 48-Port mGig", manufacturer: "Axis", category: "Network", vendor: "CDW", cost: 8425.0, price: 11540.0, stock: 2, reorderPoint: 1, reorderQty: 2 },
  { id: "p-075", sku: "FIB-LC-LC-3M", name: "OS2 Fiber Patch LC-LC 3m Yellow", manufacturer: "Axis", category: "Cabling", vendor: "Wesco", cost: 12.5, price: 19.0, stock: 145, reorderPoint: 50, reorderQty: 100 },
  { id: "p-076", sku: "RG6-1000-BLK", name: "RG6 Quad-Shield Coax 1000ft Black", manufacturer: "Axis", category: "Cabling", vendor: "Wesco", cost: 285.0, price: 405.0, stock: 18, reorderPoint: 8, reorderQty: 12 },
  { id: "p-077", sku: "RACK-42U-SFB", name: "Middle Atlantic 42U Server Rack with Front/Back Doors", manufacturer: "Axis", category: "Racks", vendor: "Provo", cost: 985.0, price: 1349.0, stock: 4, reorderPoint: 2, reorderQty: 4 },
  { id: "p-078", sku: "PDU-1U-15A", name: "Tripp Lite 15A 1U Rack PDU 12-Outlet", manufacturer: "Axis", category: "Power", vendor: "Provo", cost: 195.0, price: 269.0, stock: 14, reorderPoint: 6, reorderQty: 12 },
  { id: "p-079", sku: "MAGLOCK-1200LB", name: "Securitron M62 1200lb Maglock", manufacturer: "Kantech", category: "Accessories", vendor: "Provo", cost: 215.0, price: 299.0, stock: 22, reorderPoint: 10, reorderQty: 20 },
  { id: "p-080", sku: "REX-MOTION-SEC", name: "Bosch DS150i Request-to-Exit Motion Sensor", manufacturer: "Kantech", category: "Accessories", vendor: "Provo", cost: 65.0, price: 95.0, stock: 38, reorderPoint: 15, reorderQty: 30 },
];
