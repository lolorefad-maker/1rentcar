import os
import json
import sqlite3
from PIL import Image

PROJECT_ROOT = r'c:\Users\LENOVO\Desktop\threejsproject'
CARS_DIR = os.path.join(PROJECT_ROOT, 'public', 'media', 'cars')
MANIFEST_PATH = os.path.join(PROJECT_ROOT, 'data', 'media-manifest.json')
DB_PATH = os.path.join(PROJECT_ROOT, 'showroom.db')

SRC_MOD = r'C:\Users\LENOVO\Downloads\rentcar1\Luxury_Car_Rental-main\assets\cars'
SRC_DESK = r'c:\Users\LENOVO\Desktop\cars'
SRC_BRAIN = r'C:\Users\LENOVO\.gemini\antigravity\brain\8a218dd6-a490-4fb9-96b2-0ba4caf0b576'

# Map slug to specific modified assets (cover, interior, rear, detail)
SLUG_MAP = {
    # Rolls-Royce
    'rolls-royce-ghost-2021': {
        'cover': os.path.join(SRC_BRAIN, 'rolls_royce_ghost_1789416405137.jpg'),
        'interior': os.path.join(SRC_BRAIN, 'rr_ghost_interior_1789416437591.jpg'),
        'rear': os.path.join(SRC_MOD, 'rollsroyce_cullinan_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'rollsroyce_real_ext.jpg'),
    },
    'rolls-royce-ghost-two-tone': {
        'cover': os.path.join(SRC_BRAIN, 'rolls_royce_ghost_1789416405137.jpg'),
        'interior': os.path.join(SRC_BRAIN, 'rr_ghost_interior_1789416437591.jpg'),
        'rear': os.path.join(SRC_MOD, 'rollsroyce_cullinan_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'rollsroyce_real_int.jpg'),
    },

    # Mercedes-Maybach
    'mercedes-maybach-s580': {
        'cover': os.path.join(SRC_BRAIN, 'maybach_s580_ext_1789416456084.jpg'),
        'interior': os.path.join(SRC_BRAIN, 'maybach_s580_int_1789416472705.jpg'),
        'rear': os.path.join(SRC_MOD, 'mercedes_s500_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'mercedes_s500_interior.png'),
    },
    'mercedes-maybach-s560-2018': {
        'cover': os.path.join(SRC_BRAIN, 'maybach_s580_ext_1789416456084.jpg'),
        'interior': os.path.join(SRC_BRAIN, 'maybach_s580_int_1789416472705.jpg'),
        'rear': os.path.join(SRC_MOD, 'mercedes_s500_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'mercedes_s500_int.jpg'),
    },

    # Mercedes S-Class
    'mercedes-s-class-2025-grey': {
        'cover': os.path.join(SRC_MOD, 'mercedes_s500_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'mercedes_s500_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'mercedes_s500_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'mercedes_s500_interior.png'),
    },
    'mercedes-s-class-2025-black': {
        'cover': os.path.join(SRC_MOD, 'mercedes_s500_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'mercedes_s500_interior.png'),
        'rear': os.path.join(SRC_MOD, 'mercedes_s500_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'mercedes_s500_int.jpg'),
    },
    'mercedes-s550-2015': {
        'cover': os.path.join(SRC_MOD, 'mercedes_s500_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'mercedes_s500_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'mercedes_real_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'mercedes_real_int.jpg'),
    },
    'mercedes-s63-brabus-2016': {
        'cover': os.path.join(SRC_MOD, 'mercedes_s500_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'mercedes_s500_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'mercedes_s500_interior.png'),
        'detail': os.path.join(SRC_MOD, 'mercedes_real_ext.jpg'),
    },

    # Brabus G-Wagon
    'brabus-g800-2021': {
        'cover': os.path.join(SRC_BRAIN, 'brabus_g800_ext_1789416532415.jpg'),
        'interior': os.path.join(SRC_MOD, 'mercedes_g63_interior.png'),
        'rear': os.path.join(SRC_MOD, 'mercedes_g63_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'mercedes_g63_int.jpg'),
    },
    'brabus-g700-2021': {
        'cover': os.path.join(SRC_BRAIN, 'brabus_g800_ext_1789416532415.jpg'),
        'interior': os.path.join(SRC_MOD, 'mercedes_g63_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'mercedes_g63_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'mercedes_g63_interior.png'),
    },
    'brabus-800-cabriolet-2021': {
        'cover': os.path.join(SRC_BRAIN, 'brabus_g800_ext_1789416532415.jpg'),
        'interior': os.path.join(SRC_MOD, 'mercedes_g63_interior_v2.png'),
        'rear': os.path.join(SRC_MOD, 'mercedes_g63_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'mercedes_g63_int.jpg'),
    },

    # Mercedes-AMG G 63
    'mercedes-amg-g63-2024': {
        'cover': os.path.join(SRC_BRAIN, 'amg_g63_ext_1789416494172.jpg'),
        'interior': os.path.join(SRC_MOD, 'mercedes_g63_interior.png'),
        'rear': os.path.join(SRC_MOD, 'mercedes_g63_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'mercedes_g63_int.jpg'),
    },
    'mercedes-amg-g63-2022': {
        'cover': os.path.join(SRC_MOD, 'mercedes_g63_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'mercedes_g63_int.jpg'),
        'rear': os.path.join(SRC_BRAIN, 'amg_g63_ext_1789416494172.jpg'),
        'detail': os.path.join(SRC_MOD, 'mercedes_g63_interior_ai.png'),
    },
    'mercedes-amg-g63-2021': {
        'cover': os.path.join(SRC_MOD, 'mercedes_g500_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'mercedes_g500_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'mercedes_g63_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'mercedes_g63_interior.png'),
    },
    'mercedes-amg-g63-white': {
        'cover': os.path.join(SRC_MOD, 'mercedes_g63_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'mercedes_g63_interior.png'),
        'rear': os.path.join(SRC_MOD, 'mercedes_g500_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'mercedes_g63_int.jpg'),
    },

    # Mercedes SL & CLS
    'mercedes-amg-sl43-2024': {
        'cover': os.path.join(SRC_DESK, 'amgsl431.jpg'),
        'interior': os.path.join(SRC_DESK, 'amgsl432.jpg'),
        'rear': os.path.join(SRC_DESK, 'amgsl431.jpg'),
        'detail': os.path.join(SRC_DESK, 'amgsl432.jpg'),
    },
    'mercedes-amg-cls53': {
        'cover': os.path.join(SRC_DESK, 'cls531.jpg'),
        'interior': os.path.join(SRC_DESK, 'cls53int.jpg'),
        'rear': os.path.join(SRC_DESK, 'cls532.jpg'),
        'detail': os.path.join(SRC_DESK, 'cls533.jpg'),
    },
    'mercedes-cls350-white': {
        'cover': os.path.join(SRC_DESK, 'cls531.jpg'),
        'interior': os.path.join(SRC_DESK, 'cls53int.jpg'),
        'rear': os.path.join(SRC_DESK, 'cls532.jpg'),
        'detail': os.path.join(SRC_DESK, 'cls533.jpg'),
    },
    'mercedes-cls350-black': {
        'cover': os.path.join(SRC_DESK, 'cls532.jpg'),
        'interior': os.path.join(SRC_DESK, 'cls53int.jpg'),
        'rear': os.path.join(SRC_DESK, 'cls533.jpg'),
        'detail': os.path.join(SRC_DESK, 'cls531.jpg'),
    },

    # Mercedes E-Class
    'mercedes-e200-avantgarde-2022': {
        'cover': os.path.join(SRC_DESK, 'e200.jpg'),
        'interior': os.path.join(SRC_DESK, 'e200int.jpg'),
        'rear': os.path.join(SRC_MOD, 'mercedes_e200_2023_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'mercedes_e200_2023_int.jpg'),
    },
    'mercedes-e200-cabriolet-2024': {
        'cover': os.path.join(SRC_DESK, 'eclass1.jpg'),
        'interior': os.path.join(SRC_DESK, 'eclassint.jpg'),
        'rear': os.path.join(SRC_DESK, 'eclass2.jpg'),
        'detail': os.path.join(SRC_DESK, 'e200int.jpg'),
    },
    'mercedes-e-class-2025-white': {
        'cover': os.path.join(SRC_MOD, 'mercedes_e200_2025_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'mercedes_e200_2025_int.jpg'),
        'rear': os.path.join(SRC_DESK, 'eclass1.jpg'),
        'detail': os.path.join(SRC_DESK, 'eclassint.jpg'),
    },
    'mercedes-e-class-black': {
        'cover': os.path.join(SRC_DESK, 'eclass2.jpg'),
        'interior': os.path.join(SRC_DESK, 'eclassint.jpg'),
        'rear': os.path.join(SRC_MOD, 'mercedes_e200_2025_ext.jpg'),
        'detail': os.path.join(SRC_DESK, 'e200int.jpg'),
    },
    'mercedes-e-class-amg-line-black': {
        'cover': os.path.join(SRC_DESK, 'eclass2.jpg'),
        'interior': os.path.join(SRC_DESK, 'eclassint.jpg'),
        'rear': os.path.join(SRC_DESK, 'eclass1.jpg'),
        'detail': os.path.join(SRC_DESK, 'e200.jpg'),
    },
    'mercedes-e-class-amg-line-white': {
        'cover': os.path.join(SRC_MOD, 'mercedes_e200_2025_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'mercedes_e200_2025_int.jpg'),
        'rear': os.path.join(SRC_DESK, 'eclass1.jpg'),
        'detail': os.path.join(SRC_DESK, 'eclassint.jpg'),
    },
    'mercedes-e-class-amg-line-silver': {
        'cover': os.path.join(SRC_MOD, 'mercedes_e200_2023_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'mercedes_e200_2023_int.jpg'),
        'rear': os.path.join(SRC_DESK, 'eclass2.jpg'),
        'detail': os.path.join(SRC_DESK, 'eclassint.jpg'),
    },
    'mercedes-amg-e53-2021': {
        'cover': os.path.join(SRC_MOD, 'mercedes_e200_2023_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'mercedes_e200_2023_int.jpg'),
        'rear': os.path.join(SRC_DESK, 'eclass1.jpg'),
        'detail': os.path.join(SRC_DESK, 'eclassint.jpg'),
    },
    'mercedes-amg-e53-2020': {
        'cover': os.path.join(SRC_DESK, 'eclass2.jpg'),
        'interior': os.path.join(SRC_DESK, 'eclassint.jpg'),
        'rear': os.path.join(SRC_MOD, 'mercedes_e200_2023_ext.jpg'),
        'detail': os.path.join(SRC_DESK, 'e200int.jpg'),
    },

    # Mercedes GLE
    'mercedes-gle350-2024': {
        'cover': os.path.join(SRC_MOD, 'mercedes_gle_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'mercedes_gle_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'mercedes_gle_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'mercedes_gle_interior_ai.png'),
    },
    'mercedes-gle350e-2023': {
        'cover': os.path.join(SRC_MOD, 'mercedes_gle_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'mercedes_gle_interior_ai.png'),
        'rear': os.path.join(SRC_MOD, 'mercedes_gle_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'mercedes_gle_int.jpg'),
    },

    # BMW 7 Series & 3 Series
    'bmw-7-series': {
        'cover': os.path.join(SRC_MOD, 'bmw_7series_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'bmw_7series_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'bmw_7series_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'bmw_7series_interior.png'),
    },
    'bmw-730li': {
        'cover': os.path.join(SRC_MOD, 'bmw_7series_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'bmw_7series_interior.png'),
        'rear': os.path.join(SRC_MOD, 'bmw_real_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'bmw_real_int.jpg'),
    },
    'bmw-3-series-2024': {
        'cover': os.path.join(SRC_MOD, 'bmw_7series_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'bmw_7series_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'bmw_real_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'bmw_real_int.jpg'),
    },

    # BMW X5 & X6
    'bmw-x5-xdrive40i-2024': {
        'cover': os.path.join(SRC_MOD, 'bmw_x5_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'bmw_x5_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'bmw_x5_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'bmw_x5_int.jpg'),
    },
    'bmw-x6-2025': {
        'cover': os.path.join(SRC_MOD, 'bmw_x6_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'bmw_x6_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'bmw_x6_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'bmw_x6_int.jpg'),
    },
    'bmw-x6-grey': {
        'cover': os.path.join(SRC_MOD, 'bmw_x6_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'bmw_x6_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'bmw_x6_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'bmw_x6_int.jpg'),
    },

    # Cadillac Escalade
    'cadillac-escalade-2025': {
        'cover': os.path.join(SRC_MOD, 'cadillac_escalade_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'cadillac_escalade_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'cadillac_real_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'cadillac_real_int.jpg'),
    },
    'cadillac-escalade-black': {
        'cover': os.path.join(SRC_MOD, 'cadillac_escalade_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'cadillac_escalade_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'cadillac_real_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'cadillac_real_int.jpg'),
    },
    'cadillac-escalade-green': {
        'cover': os.path.join(SRC_MOD, 'cadillac_escalade_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'cadillac_escalade_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'cadillac_real_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'cadillac_real_int.jpg'),
    },

    # Chevrolet Tahoe
    'chevrolet-tahoe-2024': {
        'cover': os.path.join(SRC_MOD, 'chevrolet_tahoe_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'chevrolet_tahoe_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'tahoe_real_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'tahoe_real_int.jpg'),
    },
    'chevrolet-tahoe-premier-2022': {
        'cover': os.path.join(SRC_MOD, 'chevrolet_tahoe_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'chevrolet_tahoe_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'tahoe_real_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'tahoe_real_int.jpg'),
    },

    # Land Rover Defender
    'land-rover-defender-2025': {
        'cover': os.path.join(SRC_MOD, 'defender_2025_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'defender_2025_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'defender_real_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'defender_real_int.jpg'),
    },
    'land-rover-defender-2021': {
        'cover': os.path.join(SRC_MOD, 'defender_2022_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'defender_2022_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'defender_real_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'defender_real_int.jpg'),
    },
    'land-rover-defender-grey': {
        'cover': os.path.join(SRC_MOD, 'defender_2025_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'defender_2025_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'defender_2022_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'defender_2022_int.jpg'),
    },

    # Range Rover
    'range-rover-autobiography-2024': {
        'cover': os.path.join(SRC_MOD, 'rangerover_vogue_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'rangerover_vogue_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'rangerover_real_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'rangerover_vogue_interior.png'),
    },
    'range-rover-vogue-2025': {
        'cover': os.path.join(SRC_MOD, 'rangerover_vogue_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'rangerover_vogue_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'rangerover_real_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'rangerover_vogue_interior.png'),
    },
    'range-rover-sport-2025': {
        'cover': os.path.join(SRC_MOD, 'rangerover_sport_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'rangerover_sport_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'rangerover_vogue_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'rangerover_real_int.jpg'),
    },
    'range-rover-sport-hse-dynamic-2022': {
        'cover': os.path.join(SRC_MOD, 'rangerover_sport_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'rangerover_sport_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'rangerover_real_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'rangerover_vogue_interior.png'),
    },
    'range-rover-sport-hse-2021': {
        'cover': os.path.join(SRC_MOD, 'rangerover_sport_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'rangerover_sport_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'rangerover_vogue_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'rangerover_real_int.jpg'),
    },
    'range-rover-sport-2019': {
        'cover': os.path.join(SRC_MOD, 'rangerover_sport_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'rangerover_sport_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'rangerover_real_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'rangerover_vogue_interior.png'),
    },

    # Toyota Land Cruiser & Sequoia
    'toyota-land-cruiser-lc300': {
        'cover': os.path.join(SRC_MOD, 'toyota_landcruiser_2026_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'toyota_landcruiser_2026_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'landcruiser_real_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'toyota_lc300_luxury_ext.png'),
    },
    'toyota-land-cruiser-2022': {
        'cover': os.path.join(SRC_MOD, 'toyota_landcruiser_2021_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'toyota_landcruiser_2021_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'landcruiser_real_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'landcruiser_real_int.jpg'),
    },
    'toyota-sequoia-2024': {
        'cover': os.path.join(SRC_MOD, 'toyota_landcruiser_2026_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'toyota_landcruiser_2026_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'landcruiser_real_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'toyota_lc300_luxury_ext.png'),
    },

    # Hongqi H9 & E-HS9
    'hongqi-h9-2024': {
        'cover': os.path.join(SRC_DESK, 'hongqih9.jpg'),
        'interior': os.path.join(SRC_DESK, 'hongqih9int1.jpg'),
        'rear': os.path.join(SRC_DESK, 'hongqih92.jpg'),
        'detail': os.path.join(SRC_DESK, 'hongqih9int2.jpg'),
    },
    'hongqi-e-hs9-2024': {
        'cover': os.path.join(SRC_MOD, 'hongqi_h9_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'hongqi_h9_int.jpg'),
        'rear': os.path.join(SRC_DESK, 'hongqih92.jpg'),
        'detail': os.path.join(SRC_DESK, 'hongqih9int1.jpg'),
    },

    # GMC / Tahoe / Jeep / Jetour
    'jeep-gladiator-2024': {
        'cover': os.path.join(SRC_MOD, 'gmc_yukon_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'gmc_yukon_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'gmc_yukon_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'gmc_yukon_int.jpg'),
    },
    'jeep-gladiator-rubicon-2022': {
        'cover': os.path.join(SRC_MOD, 'gmc_yukon_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'gmc_yukon_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'gmc_yukon_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'gmc_yukon_int.jpg'),
    },
    'jeep-grand-cherokee-srt': {
        'cover': os.path.join(SRC_MOD, 'gmc_yukon_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'gmc_yukon_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'gmc_yukon_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'gmc_yukon_int.jpg'),
    },
    'jetour-t2-2025': {
        'cover': os.path.join(SRC_MOD, 'defender_2025_ext.jpg'),
        'interior': os.path.join(SRC_MOD, 'defender_2025_int.jpg'),
        'rear': os.path.join(SRC_MOD, 'defender_2022_ext.jpg'),
        'detail': os.path.join(SRC_MOD, 'defender_2022_int.jpg'),
    },
}

def save_variant(im, dest_full, dest_thumb):
    im.save(dest_full, 'WEBP', quality=90, method=6)
    w, h = im.size
    aspect = h / w
    thumb = im.resize((640, int(640 * aspect)), Image.Resampling.LANCZOS)
    thumb.save(dest_thumb, 'WEBP', quality=85, method=6)

def run():
    print('Starting deployment of authentic modified photos...')
    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    updated_count = 0
    for slug, angles in SLUG_MAP.items():
        car_dir = os.path.join(CARS_DIR, slug)
        os.makedirs(car_dir, exist_ok=True)

        images_list = []
        for role in ['cover', 'interior', 'rear', 'detail']:
            src_file = angles.get(role)
            if not src_file or not os.path.exists(src_file):
                continue
            
            dest_full = os.path.join(car_dir, f'{role}.webp')
            dest_thumb = os.path.join(car_dir, f'{role}-640.webp')
            
            try:
                with Image.open(src_file) as im:
                    im = im.convert('RGB')
                    save_variant(im, dest_full, dest_thumb)
                
                rel_full = f'/media/cars/{slug}/{role}.webp'
                rel_thumb = f'/media/cars/{slug}/{role}-640.webp'
                images_list.append(rel_full)
                
                if slug not in manifest:
                    manifest[slug] = {}
                manifest[slug][role] = rel_full
            except Exception as e:
                print(f'Error processing {src_file} for {slug}: {e}')

        if images_list:
            cur.execute('UPDATE cars SET images = ? WHERE slug = ?', (json.dumps(images_list), slug))
            updated_count += 1
            print(f'[{updated_count}] Updated {slug} with {len(images_list)} modified angles')

    conn.commit()
    conn.close()

    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f'All done! Successfully updated {updated_count} cars with authentic modified photos.')

if __name__ == '__main__':
    run()
