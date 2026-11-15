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
