"""Writes art/blender/mh_cast.json: every person of the game, each with a face of their own.

    python art/blender/make_cast.py

The faces start from a shared refinement (fine lips, a straight nose, a clear jaw) and each person then gets their
own shape: an oval or square head, high cheekbones or round cheeks, a long or short nose... Clothes are in the club's
colours (white, IST blue, navy, a touch of yellow), the club's logo on the chest of every club garment.
"""
import json
import os

LOGO, BACK, BACK_DARK = 'art/prints/club-logo.png', 'art/prints/club-back.png', 'art/prints/club-back-dark.png'
SUIT = '#060f22'
WHITE, BLUE, NAVY, DENIM, SAND, GREY = '#f4f6f8', '#1640b0', '#0b1e3f', '#1e2a4a', '#c8b48a', '#3b4250'


def face(**extra):
    """The shared refinement, then the person's own touches (target name without the group: value)."""
    base = {
        'mouth/mouth-upperlip-volume-decr': 0.45, 'mouth/mouth-lowerlip-volume-decr': 0.4,
        'mouth/mouth-scale-horiz-decr': 0.15, 'mouth/mouth-angles-up': 0.25,
        'nose/nose-flaring-decr': 0.4, 'nose/nose-scale-horiz-decr': 0.2, 'nose/nose-point-width-decr': 0.25,
    }
    base.update(extra)
    return base


def sym(group, name, value):
    """A left and right target with the same value."""
    return {f'{group}/l-{name}': value, f'{group}/r-{name}': value}


def polo(colour, front_z=-0.385, back_z=-0.47, back=None):
    return ['namuhekam_male_polo_shirt', colour, [['front', LOGO, front_z, 0.1], ['back', back or (BACK_DARK if colour == WHITE else BACK), back_z, 0.25]], True]


cast = {
    # The player, a young man: short afro with a fade, a light goatee.
    'student-m': dict(
        sex='male', age=0.4, muscle=0.62, weight=0.45, height=0.65, proportions=0.75,
        skin='young_african_male', hair='afro01', hair_colour='#2e2e2e', eyebrows='eyebrow001',
        fade={'top': 0.075, 'low': 0.0}, beard=0.6, lips=0.6,
        targets=face(**{'chin/chin-prominent-incr': 0.2, 'chin/chin-width-incr': 0.15, 'head/head-oval': 0.4},
                     **sym('cheek', 'cheek-bones-incr', 0.35)),
        clothes=[['mindfront_male_trousers_1', DENIM], polo(WHITE), ['punkduck_comfortable_sneakers', None]]),
    # The player, a young woman: braided bun, the club's blue polo.
    'student-f': dict(
        sex='female', age=0.38, muscle=0.45, weight=0.42, height=0.55, proportions=0.8, waist=1.08,
        skin='young_african_female', hair='elvs_braid_bun', hair_colour='#2a2a2a', eyebrows='eyebrow010', lips=0.5,
        targets=face(**{'mouth/mouth-angles-up': 0.35, 'mouth/mouth-dimples-in': 0.2, 'chin/chin-width-decr': 0.3,
                        'chin/chin-prominent-incr': 0.15, 'head/head-oval': 0.6, 'nose/nose-scale-horiz-decr': 0.25},
                     **sym('cheek', 'cheek-bones-incr', 0.45), **sym('eyes', 'eye-scale-incr', 0.15)),
        clothes=[['mindfront_female_trousers_1', DENIM, [], True], polo(BLUE), ['punkduck_running_shoes_01', None]]),
    # Awa, club member: long curls, navy club polo.
    'awa': dict(
        sex='female', age=0.36, muscle=0.4, weight=0.48, height=0.5, proportions=0.75, waist=1.06,
        skin='young_african_female', hair='punkduck_alpha7_curly', hair_colour='#1f1a17', eyebrows='eyebrow011', lips=0.5,
        targets=face(**{'head/head-round': 0.35, 'mouth/mouth-angles-up': 0.4, 'mouth/mouth-dimples-in': 0.35,
                        'nose/nose-point-up': 0.2, 'chin/chin-width-decr': 0.2},
                     **sym('cheek', 'cheek-volume-incr', 0.25), **sym('eyes', 'eye-scale-incr', 0.2)),
        clothes=[['mindfront_female_trousers_1', DENIM, [], True], polo(NAVY), ['punkduck_tennis_shoes', None]]),
    # Ibrahim, network student: waves on top, high fade, white club polo, cargo trousers.
    'ibrahim': dict(
        sex='male', age=0.42, muscle=0.55, weight=0.5, height=0.7, proportions=0.7,
        skin='young_african_male', hair='short03', hair_colour='#121212', eyebrows='eyebrow002', waist=1.13,
        fade={'top': 0.1, 'low': 0.02, 'hairline': 0.075}, beard=0.5, lips=0.6,
        targets=face(**{'head/head-rectangular': 0.35, 'chin/chin-width-incr': 0.25, 'chin/chin-height-incr': 0.15,
                        'nose/nose-scale-vert-incr': 0.15, 'eyebrows/eyebrows-trans-down': 0.2},
                     **sym('cheek', 'cheek-bones-incr', 0.2)),
        clothes=[['cortu_cargo_pants', SAND, [], True], polo(WHITE), ['culturalibre_sneakers', None]]),
    # Seydou, first year: short afro with a high skin fade, the club's blue polo, jeans.
    'seydou': dict(
        sex='male', age=0.34, muscle=0.45, weight=0.4, height=0.55, proportions=0.65,
        skin='young_african_male', hair='afro01', hair_colour='#1c1c1c', eyebrows='eyebrow003',
        fade={'top': 0.095, 'low': 0.03, 'density': 0.9}, lips=0.6,
        targets=face(**{'head/head-oval': 0.6, 'head/head-age-decr': 0.3, 'mouth/mouth-angles-up': 0.35,
                        'nose/nose-scale-vert-decr': 0.15, 'chin/chin-width-decr': 0.1, 'eyebrows/eyebrows-angle-up': 0.3},
                     **sym('eyes', 'eye-scale-incr', 0.15)),
        clothes=[['mindfront_male_trousers_1', DENIM], polo(BLUE), ['punkduck_tennis_shoes', None]]),
    # M. Kaboré, teacher: close crop, trimmed beard, light blue shirt, dark trousers.
    'm-kabore': dict(
        sex='male', age=0.62, muscle=0.5, weight=0.6, height=0.6, proportions=0.6,
        skin='middleage_african_male', hair='afro01', hair_colour='#262626', eyebrows='eyebrow004',
        fade={'top': 0.06, 'low': 0.0, 'density': 0.85}, beard=0.8, lips=0.55,
        targets=face(**{'head/head-square': 0.4, 'chin/chin-width-incr': 0.2, 'nose/nose-scale-horiz-decr': 0.1,
                        'mouth/mouth-angles-up': 0.15, 'forehead/forehead-scale-vert-incr': 0.2}),
        clothes=[['mindfront_male_trousers_2', GREY], ['elvs_male_shirt_untucked_bd1', '#cfe0f5', [['front', LOGO, -0.385, 0.08]], True],
                 ['mindfront_shoes_oxford_male', None]]),
    # Mme Ouédraogo, management office: sleek low ponytail, navy suit.
    'mme-ouedraogo': dict(
        sex='female', age=0.55, muscle=0.4, weight=0.55, height=0.5, proportions=0.6,
        skin='middleage_african_female', hair='ponytail01', hair_colour='#1d1d1d', eyebrows='eyebrow009', lips=0.55,
        targets=face(**{'head/head-oval': 0.5, 'mouth/mouth-angles-up': 0.3, 'chin/chin-width-decr': 0.15},
                     **sym('cheek', 'cheek-bones-incr', 0.3)),
        clothes=[['female_elegantsuit01', SUIT, [], True], ['dressupdoc_maryjane1', '#151515']]),
    # Fatim, agency reception: cornrows, white top, navy trousers.
    'fatim': dict(
        sex='female', age=0.4, muscle=0.4, weight=0.4, height=0.6, proportions=0.85, waist=1.08,
        skin='young_african_female', hair='elvs_braided_rows', hair_colour='#1b1b1b', eyebrows='eyebrow012', lips=0.5,
        targets=face(**{'head/head-diamond': 0.3, 'mouth/mouth-angles-up': 0.45, 'nose/nose-point-width-decr': 0.35,
                        'chin/chin-prominent-incr': 0.1},
                     **sym('cheek', 'cheek-bones-incr', 0.5), **sym('eyes', 'eye-scale-incr', 0.1)),
        clothes=[['mindfront_female_trousers_1', NAVY, [], True], polo(WHITE), ['dressupdoc_balletflat1', None]]),
    # M. Traoré, agency director: greying crop, beard, navy suit.
    'm-traore': dict(
        sex='male', age=0.72, muscle=0.45, weight=0.62, height=0.65, proportions=0.55,
        skin='middleage_african_male', hair='afro01', hair_colour='#4a4744', eyebrows='eyebrow005',
        fade={'top': 0.05, 'low': -0.005, 'density': 0.8}, beard=0.9, lips=0.55,
        targets=face(**{'head/head-rectangular': 0.4, 'head/head-fat-incr': 0.2, 'chin/chin-width-incr': 0.3,
                        'nose/nose-scale-horiz-decr': 0.05, 'mouth/mouth-angles-up': 0.1}),
        clothes=[['male_elegantsuit01', SUIT, [], True], ['mindfront_shoes_oxford_male', None]]),
    # Adama, operations technician: short afro with a fade, navy work clothes.
    'adama': dict(
        sex='male', age=0.45, muscle=0.7, weight=0.5, height=0.62, proportions=0.7,
        skin='young_african_male', hair='afro01', hair_colour='#202020', eyebrows='eyebrow006',
        fade={'top': 0.07, 'low': 0.0}, beard=0.4, lips=0.6,
        targets=face(**{'head/head-square': 0.3, 'chin/chin-prominent-incr': 0.25, 'nose/nose-volume-decr': 0.2},
                     **sym('cheek', 'cheek-bones-incr', 0.3)),
        clothes=[['male_worksuit01', NAVY, [['front', LOGO, -0.385, 0.09]], True], ['punkduck_comfortable_sneakers', None]]),
    # Mariam, network engineer: long braids, white club polo, dark trousers.
    'mariam': dict(
        sex='female', age=0.46, muscle=0.45, weight=0.45, height=0.58, proportions=0.75, waist=1.08,
        skin='young_african_female', hair='elvs_island_princess_hair', hair_colour='#141210', eyebrows='eyebrow010', lips=0.5,
        targets=face(**{'head/head-invertedtriangular': 0.3, 'mouth/mouth-angles-up': 0.3, 'nose/nose-scale-vert-decr': 0.1,
                        'chin/chin-width-decr': 0.25},
                     **sym('cheek', 'cheek-bones-incr', 0.35)),
        clothes=[['mindfront_female_trousers_1', GREY, [], True], polo(WHITE), ['punkduck_running_shoes_01', None]]),
}

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mh_cast.json')
json.dump(cast, open(out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('wrote', out, len(cast), 'people')
