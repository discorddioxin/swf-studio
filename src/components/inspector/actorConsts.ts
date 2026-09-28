// Constants and key helpers shared by the Actors tab.
// Extracted verbatim from Inspector.tsx (DECOMPOSITION_SPEC phases 3–10).

import { type ActorClassification, type ActorCombatMode, type ActorFacing, type ActorLayer, type ActorMovementSlot } from '../../types';

export const ACTOR_MOVEMENT_SLOTS: { key: ActorMovementSlot; label: string }[] = [
  { key: 'idle', label: 'Idle' },
  { key: 'moveLeft', label: 'Move left' },
  { key: 'moveRight', label: 'Move right' },
  { key: 'moveUp', label: 'Move up' },
  { key: 'moveDown', label: 'Move down' },
  { key: 'moveLeftUp', label: 'Move left + up' },
  { key: 'moveRightUp', label: 'Move right + up' },
  { key: 'moveLeftDown', label: 'Move left + down' },
  { key: 'moveRightDown', label: 'Move right + down' },
];

export const ACTOR_FACING_SLOTS: { key: ActorFacing; label: string }[] = [
  { key: 'front-left', label: 'Front-left' },
  { key: 'front-right', label: 'Front-right' },
  { key: 'back-left', label: 'Back-left' },
  { key: 'back-right', label: 'Back-right' },
];

export const ACTOR_WALK_SLOTS: { key: 'left' | 'right' | 'up' | 'down'; label: string }[] = [
  { key: 'left', label: 'Walk left' },
  { key: 'right', label: 'Walk right' },
  { key: 'up', label: 'Walk up' },
  { key: 'down', label: 'Walk down' },
];

export const ACTOR_COMBAT_OPTIONS: { value: ActorCombatMode; label: string }[] = [
  { value: 'none', label: 'No Combat' },
  { value: 'combat', label: 'Combat' },
  { value: 'canAttack', label: 'Can Attack' },
  { value: 'canBeAttacked', label: 'Can Be Attacked' },
];

export const ACTOR_CLASSIFICATIONS: ActorClassification[] = ['Monster', 'Item', 'Item Scene', 'Item Inventory', 'Scenery', 'NPC', 'Player', 'Prop', 'Effect', 'Other'];
export const ACTOR_LAYERS: ActorLayer[] = ['Background', 'World', 'Foreground', 'HUD'];
