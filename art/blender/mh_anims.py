"""The shared animations of the game's people, on the MakeHuman game-engine skeleton.

    blender --background --python art/blender/mh_anims.py -- <UAL1_Standard.glb> <anims.glb> [check.png]

Quaternius's Universal Animation Library (CC0) moves a skeleton with the same bone names as MakeHuman's game-engine
rig, but it rests in a T pose where MakeHuman rests in an A pose, with other bone rolls. The motion is therefore carried
over in world space, frame by frame: the trunk keeps the offset between the two rest poses (both stand upright), every
limb bone is turned so that it points where the source bone points, with its own roll. The hips follow the source's
hips, scaled to the height of the reference person. One clip per motion, on the reference person's skeleton: every person
shares the bone names, so the game plays the same clips on all of them.
"""
import bpy
import os
import sys
from mathutils import Matrix, Vector

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402

KEEP = [
    'Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Crouch_Idle_Loop',
    'Fixing_Kneeling', 'Interact', 'PickUp_Table', 'Sitting_Enter', 'Sitting_Exit', 'Sitting_Idle_Loop',
    'Sitting_Talking_Loop',
]
TRUNK = {'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head'}

src_file, out_file = c.args()[0], c.args()[1]
check = c.args()[2] if len(c.args()) > 2 else None

# The reference person: the player, built as for the game (only the skeleton is kept in the end).
here = os.path.dirname(os.path.abspath(__file__))
sys.argv = [sys.argv[0], '--', os.path.join(here, 'mh_cast.json') + '#student-m', '-']
exec(compile(open(os.path.join(here, 'mh_person.py'), encoding='utf-8').read(), 'mh_person.py', 'exec'))
R = next(o for o in bpy.data.objects if o.type == 'ARMATURE')

before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=src_file)
A = next(o for o in set(bpy.data.objects) - before if o.type == 'ARMATURE')
for o in set(bpy.data.objects) - before:
    if o.type == 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)
src_by_lower = {b.name.lower(): b.name for b in A.data.bones}

RW3 = R.matrix_world.to_3x3()
RW3i = RW3.inverted()
order = [b for b in R.data.bones]  # parents always come before their children
mapped = {b.name: src_by_lower.get(b.name.lower()) for b in order}
corr = {}
for b in order:
    s = mapped[b.name]
    if not s:
        continue
    Sr = (A.matrix_world @ A.data.bones[s].matrix_local).to_3x3().normalized()
    Tr = (R.matrix_world @ b.matrix_local).to_3x3().normalized()
    if b.name in TRUNK:
        corr[b.name] = Sr.inverted() @ Tr
    else:
        sy, ty = Sr.col[1].normalized(), Tr.col[1].normalized()
        align = ty.rotation_difference(sy).to_matrix()
        corr[b.name] = Sr.inverted() @ (align @ Tr)

pel_s = (A.matrix_world @ A.data.bones[mapped['pelvis']].head_local)
pel_t = (R.matrix_world @ R.data.bones['pelvis'].head_local)
scale = pel_t.z / pel_s.z
print('hips scale', round(scale, 3))

R.animation_data_create()
A.animation_data_create()
made = []
for name in KEEP:
    act = bpy.data.actions.get(name)
    if not act:
        print('missing', name)
        continue
    A.animation_data.action = act
    if hasattr(A.animation_data, 'action_slot') and act.slots:
        A.animation_data.action_slot = act.slots[0]
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    new = bpy.data.actions.new(name + '_mh')
    R.animation_data.action = new
    prev = {}
    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f)
        pose_arm = {}
        for b in order:
            pb = R.pose.bones[b.name]
            s = mapped[b.name]
            rest_rel = (b.parent.matrix_local.inverted() @ b.matrix_local).to_3x3() if b.parent else b.matrix_local.to_3x3()
            parent_pose = pose_arm[b.parent.name] if b.parent else Matrix.Identity(3)
            if s:
                W = (A.matrix_world @ A.pose.bones[s].matrix).to_3x3().normalized() @ corr[b.name]
                want = RW3i @ W
                basis = rest_rel.inverted() @ parent_pose.inverted() @ want
            else:
                basis = Matrix.Identity(3)
            pose_arm[b.name] = parent_pose @ rest_rel @ basis
            q = basis.to_quaternion().normalized()
            if b.name in prev and q.dot(prev[b.name]) < 0:
                q.negate()
            prev[b.name] = q
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=f - f0, group=b.name)
        # The hips: where the source's hips are, at the reference person's height.
        hs = A.matrix_world @ A.pose.bones[mapped['pelvis']].head
        want = pel_t + (hs - pel_s) * scale
        pel = R.data.bones['pelvis']
        par = R.data.bones['pelvis'].parent
        par_m = par.matrix_local if par else Matrix.Identity(4)
        local = (R.matrix_world @ par_m @ (par_m.inverted() @ pel.matrix_local)).inverted() @ want
        R.pose.bones['pelvis'].location = local
        R.pose.bones['pelvis'].keyframe_insert('location', frame=f - f0, group='pelvis')
    new.use_fake_user = True
    made.append(new)
    print('clip', name, f1 - f0 + 1, 'frames')



def derive(src_name, name, knee, hip, lean):
    """A gait for the stairs, from the walk: on stairs the knee lifts higher and bends more, the trunk leans into the
    climb. Each leg's bend is read in the walk itself (its sign tells the hinge's direction), then amplified."""
    from mathutils import Quaternion
    src = next(a for a in made if a.name == src_name + '_mh')
    act = src.copy()
    act.name = name + '_mh'
    act.use_fake_user = True
    curves = {}
    for fc in (fc for b in [act] for fc in (b.fcurves if hasattr(b, 'fcurves') else [])):
        curves.setdefault(fc.data_path, {})[fc.array_index] = fc
    if not curves:  # layered actions (Blender 4.4+): the curves live in the action's channel bag
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for fc in bag.fcurves:
                        curves.setdefault(fc.data_path, {})[fc.array_index] = fc
    def rot(bone):
        return curves.get(f'pose.bones["{bone}"].rotation_quaternion')
    import math

    def swing(qs):
        """The axis a bone swings about in the walk, and its angle about it at each frame (from the first frame)."""
        rel = [qs[0].inverted() @ q for q in qs]
        widest = max(rel, key=lambda r: r.angle if r.angle <= math.pi else 2 * math.pi - r.angle)
        axis = widest.axis.normalized()
        angles = [2 * math.atan2(r.x * axis.x + r.y * axis.y + r.z * axis.z, r.w) for r in rel]
        return axis, angles

    for side in ('l', 'r'):
        calf, thigh = rot(f'calf_{side}'), rot(f'thigh_{side}')
        if not calf or not thigh:
            continue
        n = len(calf[0].keyframe_points)
        cq = [Quaternion([calf[i].keyframe_points[k].co[1] for i in range(4)]) for k in range(n)]
        tq = [Quaternion([thigh[i].keyframe_points[k].co[1] for i in range(4)]) for k in range(n)]
        caxis, ca = swing(cq)
        taxis, ta = swing(tq)
        # The knee folds one way only: its bend is how far it is from its straightest frame, in that direction.
        lo, hi = min(ca), max(ca)
        fold = 1 if abs(hi) >= abs(lo) else -1
        straight = lo if fold > 0 else hi
        bends = [abs(x - straight) for x in ca]
        # Forward for the thigh is the way it swings while the knee is folded (the leg comes through in the air).
        mb, mt = sum(bends) / n, sum(ta) / n
        fwd = 1 if sum((b - mb) * (t - mt) for b, t in zip(bends, ta)) >= 0 else -1
        for k in range(n):
            new_c = cq[k] @ Quaternion(caxis, fold * (knee * bends[k] + 0.1))
            new_t = tq[k] @ Quaternion(taxis, fwd * (hip * bends[k] + 0.06))
            for i in range(4):
                calf[i].keyframe_points[k].co[1] = new_c[i]
                thigh[i].keyframe_points[k].co[1] = new_t[i]
    spine = rot('spine_01')
    if spine:
        for k in range(len(spine[0].keyframe_points)):
            q = Quaternion([spine[i].keyframe_points[k].co[1] for i in range(4)]) @ Quaternion((1, 0, 0), lean)
            for i in range(4):
                spine[i].keyframe_points[k].co[1] = q[i]
    for group in curves.values():
        for fc in group.values():
            fc.update()
    made.append(act)
    print('clip', name, 'derived from', src_name)


derive('Walk_Loop', 'Stairs_Up_Loop', knee=0.3, hip=0.42, lean=0.1)
derive('Walk_Loop', 'Stairs_Down_Loop', knee=0.25, hip=0.15, lean=-0.04)

R.animation_data.action = None
for act in made:
    track = R.animation_data.nla_tracks.new()
    track.name = act.name[:-3]
    strip = track.strips.new(act.name[:-3], 0, act)
    strip.name = act.name[:-3]
    track.mute = True
for act in made:
    act.name = act.name[:-3] if not bpy.data.actions.get(act.name[:-3]) else act.name

if check:
    # A frame of the walk, to check by eye.
    for t in R.animation_data.nla_tracks:
        t.mute = t.name != 'Walk_Loop'
    bpy.data.objects.remove(A, do_unlink=True)
    bpy.context.scene.frame_set(8)
    c.preview(check, target=(0, 0, 0.92), distance=3.6, angle=(-60, 5), size=(700, 900))
    for t in R.animation_data.nla_tracks:
        t.mute = True

bpy.ops.object.select_all(action='DESELECT')
R.select_set(True)
bpy.context.view_layer.objects.active = R
bpy.ops.export_scene.gltf(filepath=out_file, export_format='GLB', use_selection=True, export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_yup=True, export_skins=True,
                          export_optimize_animation_size=True)
print('exported', out_file, os.path.getsize(out_file) // 1024, 'KB')
