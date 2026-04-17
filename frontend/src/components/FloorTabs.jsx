import React, { useState, useRef } from 'react';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  KeyboardSensor, useSensor, useSensors
} from '@dnd-kit/core';
import {
  SortableContext, horizontalListSortingStrategy,
  useSortable, arrayMove, sortableKeyboardCoordinates
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, GripVertical, Trash2, Check, X, Pencil } from 'lucide-react';

// Restrict drag movement to the horizontal axis only (no @dnd-kit/modifiers needed)
const restrictToHorizontalAxis = ({ transform }) => ({
  ...transform,
  y: 0,
});

function SortableFloorTab({ floor, isActive, onClick, onDelete, canDelete, onReorderFloors, onRename, showRoomCount }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: floor.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(floor.name);
  const inputRef = useRef(null);

  const startEdit = (e) => {
    e.stopPropagation();
    setDraft(floor.name);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitEdit = () => {
    const name = draft.trim();
    if (name && name !== floor.name) onRename?.(floor.id, name);
    setEditing(false);
  };

  const cancelEdit = () => { setDraft(floor.name); setEditing(false); };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`floor-tab ${isActive ? 'active' : ''}`}
      onClick={!editing ? onClick : undefined}
      onDoubleClick={(!editing && onRename) ? startEdit : undefined}
      title={(!editing && onRename) ? "Double-click to rename" : undefined}
    >
      {onReorderFloors && (
        <span
          className="floor-tab-grip"
          {...attributes}
          {...listeners}
          title="Drag to reorder"
        >
          <GripVertical size={12} />
        </span>
      )}

      {editing ? (
        <input
          ref={inputRef}
          className="floor-tab-rename-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
            if (e.key === 'Escape') cancelEdit();
          }}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <span className="floor-tab-label">
          {floor.name}
          {showRoomCount && (
            <span className="floor-tab-count">
              {floor.rooms?.length || 0}
            </span>
          )}
        </span>
      )}

      {!editing && canDelete && (
        <button
          className="floor-tab-delete"
          title="Delete floor"
          onClick={e => { e.stopPropagation(); onDelete(floor.id); }}
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}

export default function FloorTabs({
  floors,
  activeFloorId,
  onSelectFloor,
  onReorderFloors = null,
  onAddFloor,
  onDeleteFloor,
  onRenameFloor = null,
  showAddButton = true,
  showRoomCount = true,
  largeTabs = false,
  extraTab = null,
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }) => {
    if (!onReorderFloors || !over || active.id === over.id) return;
    const oi = floors.findIndex(f => f.id === active.id);
    const ni = floors.findIndex(f => f.id === over.id);
    onReorderFloors(arrayMove(floors, oi, ni));
  };

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    onAddFloor(name);
    setNewName('');
    setAdding(false);
  };

  const floorIds = floors.map(f => f.id);

  return (
    <div className="floor-tabs-wrapper">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={floorIds} strategy={horizontalListSortingStrategy}>
          <div className={`floor-tabs-strip ${largeTabs ? 'large-tabs' : ''}`}>
            {extraTab}
            {floors.map(floor => (
              <SortableFloorTab
                key={floor.id}
                floor={floor}
                isActive={floor.id === activeFloorId}
                onClick={() => onSelectFloor(floor.id)}
                onDelete={onDeleteFloor}
                canDelete={!!onDeleteFloor && floors.length > 1}
                onReorderFloors={onReorderFloors}
                onRename={onRenameFloor}
                showRoomCount={showRoomCount}
              />
            ))}
            {showAddButton && !adding && (
              <button className="floor-tab-add" onClick={() => setAdding(true)} title="Add floor">
                <Plus size={14} /> Add Floor
              </button>
            )}
            {adding && (
              <div className="floor-tab-new-input">
                <input
                  autoFocus
                  className="form-input floor-tab-input"
                  placeholder="Floor name…"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAdd();
                    if (e.key === 'Escape') { setAdding(false); setNewName(''); }
                  }}
                />
                <button className="floor-tab-confirm" onClick={handleAdd} title="Confirm">
                  <Check size={14} />
                </button>
                <button className="floor-tab-cancel" onClick={() => { setAdding(false); setNewName(''); }} title="Cancel">
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
