// Üretim (crafting) arayüzü: tarif listesi (üst) + 4 girdi slotu ve çıktı (alt).
// Saf çizim katmanıdır: tarif verisi Crafting.js'ten, envanter/üretim kararı
// sahneden gelir. Sunucu yetkili akış: oyuncu slotları doldurur → eşleşen
// tarif + önizleme görünür → Üret düğmesi → sahne.craftItem → sunucu doğrular.
import {
  craftingRecipes,
  getRecipe,
  matchRecipe,
  craftingOutputName,
  craftingOutputIcon,
} from "../core/Crafting.js";
import { UI_DEPTH } from "./uiDepth.js";

const CRAFT_SLOTS = 4;

export class CraftingView {
  constructor(scene, inventoryView) {
    this.scene = scene;
    this.inventoryView = inventoryView;
    this.open = false;
    this.group = null;
    this.recipeList = [];
    this.selectedRecipeId = null;
    this.slots = [null, null, null, null];
    this.slotCells = [];
    this.recipeRows = [];
    this.resultIcon = null;
    this.resultText = null;
    this.craftButton = null;
    this.craftButtonText = null;
    this.infoText = null;
    this.onCraft = null;
  }

  get isOpen() {
    return this.open;
  }

  openPanel(anchor) {
    if (this.open) return;
    this.open = true;
    this.slots = [null, null, null, null];
    this.selectedRecipeId = null;
    try {
      this.recipeList = craftingRecipes();
    } catch (error) {
      this.recipeList = [];
    }
    const cam = this.scene.cameras.main;
    const d = UI_DEPTH + 1;
    const group = this.scene.add.group();
    this.group = group;
    const invRight = anchor ? anchor.x + anchor.w : cam.width / 2 + 280;
    const invTop = anchor ? anchor.y : cam.height / 2 - 220;
    const invH = anchor ? anchor.h : 440;
    const panelW = Math.min(300, Math.max(220, cam.width - invRight - 30));
    const gap = 12;
    const upperH = Math.floor(invH * 0.52);
    const lowerH = invH - upperH - gap;
    const cx = Math.min(
      invRight + gap + panelW / 2,
      cam.width - panelW / 2 - 10,
    );
    const upperY = invTop + upperH / 2;
    const lowerY = invTop + upperH + gap + lowerH / 2;
    group.add(
      this.scene.add
        .rectangle(cx, upperY, panelW, upperH, 0x2b2118, 0.97)
        .setDepth(d)
        .setScrollFactor(0),
    );
    group.add(
      this.scene.add
        .rectangle(cx, upperY, panelW, upperH)
        .setStrokeStyle(2, 0x8a5a2b, 1)
        .setDepth(d)
        .setScrollFactor(0),
    );
    group.add(
      this.scene.add
        .text(cx, upperY - upperH / 2 + 22, "Tarifler", {
          fontFamily: "Monocraft",
          fontSize: "20px",
          fontStyle: "bold",
          color: "#ffe9b0",
          stroke: "#000000",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(d)
        .setScrollFactor(0),
    );
    group.add(
      this.scene.add
        .rectangle(cx, lowerY, panelW, lowerH, 0x2b2118, 0.97)
        .setDepth(d)
        .setScrollFactor(0),
    );
    group.add(
      this.scene.add
        .rectangle(cx, lowerY, panelW, lowerH)
        .setStrokeStyle(2, 0x8a5a2b, 1)
        .setDepth(d)
        .setScrollFactor(0),
    );
    group.add(
      this.scene.add
        .text(cx, lowerY - lowerH / 2 + 22, "Uretim", {
          fontFamily: "Monocraft",
          fontSize: "20px",
          fontStyle: "bold",
          color: "#ffe9b0",
          stroke: "#000000",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(d)
        .setScrollFactor(0),
    );
    this._buildRecipeRows(group, cx, upperY, panelW, upperH, d);
    this._buildCraftArea(group, cx, lowerY, panelW, lowerH, d);
    this.refresh();
  }

  _buildRecipeRows(group, cx, upperY, panelW, upperH, d) {
    this.recipeRows = [];
    const listTop = upperY - upperH / 2 + 44;
    const rowH = 44;
    const maxRows = Math.max(1, Math.floor((upperH - 56) / rowH));
    const rows = this.recipeList.slice(0, maxRows);
    if (!rows.length) {
      const empty = this.scene.add
        .text(cx, listTop + 20, "Tarif yok", {
          fontFamily: "Monocraft",
          fontSize: "16px",
          color: "#c1c19d",
        })
        .setOrigin(0.5)
        .setDepth(d)
        .setScrollFactor(0);
      group.add(empty);
      return;
    }
    rows.forEach((recipe, i) => {
      const y = listTop + i * rowH + rowH / 2;
      const bg = this.scene.add
        .rectangle(cx, y, panelW - 16, rowH - 6, 0x241a10)
        .setDepth(d)
        .setScrollFactor(0)
        .setInteractive();
      group.add(bg);
      const iconKey = craftingOutputIcon(recipe, (id) =>
        this.inventoryView.iconOf(id),
      );
      const icon = this.scene.add
        .image(cx - panelW / 2 + 32, y, iconKey || "__ICON_EMPTY__")
        .setDepth(d)
        .setScrollFactor(0)
        .setVisible(Boolean(iconKey));
      if (iconKey) this.inventoryView._fitIcon(icon, 28);
      group.add(icon);
      const label = this.scene.add
        .text(
          cx - panelW / 2 + 52,
          y - 8,
          craftingOutputName(recipe, (id) => this.inventoryView.labelOf(id)),
          {
            fontFamily: "Monocraft",
            fontSize: "15px",
            color: "#ffe9b0",
          },
        )
        .setOrigin(0, 0.5)
        .setDepth(d)
        .setScrollFactor(0);
      group.add(label);
      const inputs = recipe.inputs
        .map(
          (input) =>
            `${this.inventoryView.labelOf(input.itemId)} x${input.count}`,
        )
        .join(" + ");
      const sub = this.scene.add
        .text(cx - panelW / 2 + 52, y + 10, inputs, {
          fontFamily: "Monocraft",
          fontSize: "11px",
          color: "#c1c19d",
        })
        .setOrigin(0, 0.5)
        .setDepth(d)
        .setScrollFactor(0);
      group.add(sub);
      bg.on("pointerover", () => {
        if (recipe.id !== this.selectedRecipeId) bg.setFillStyle(0x3a2c1c);
      });
      bg.on("pointerout", () => {
        if (recipe.id !== this.selectedRecipeId) bg.setFillStyle(0x241a10);
      });
      bg.on("pointerdown", () => this.selectRecipe(recipe.id));
      this.recipeRows.push({ bg, recipeId: recipe.id });
    });
  }

  _buildCraftArea(group, cx, lowerY, panelW, lowerH, d) {
    this.slotCells = [];
    const slotSize = 52;
    const slotGap = 8;
    const totalW = CRAFT_SLOTS * slotSize + (CRAFT_SLOTS - 1) * slotGap;
    const y0 = lowerY - lowerH / 2 + 52 + slotSize / 2;
    const x0 = cx - totalW / 2 + slotSize / 2;
    for (let i = 0; i < CRAFT_SLOTS; i++) {
      const x = x0 + i * (slotSize + slotGap);
      const bg = this.scene.add
        .rectangle(x, y0, slotSize, slotSize, 0x241a10)
        .setDepth(d)
        .setScrollFactor(0)
        .setInteractive();
      group.add(bg);
      const icon = this.scene.add
        .image(x, y0 - 3, "__ICON_EMPTY__")
        .setDepth(d)
        .setScrollFactor(0)
        .setVisible(false);
      group.add(icon);
      const countText = this.scene.add
        .text(x + slotSize / 2 - 4, y0 + slotSize / 2 - 3, "", {
          fontFamily: "Monocraft",
          fontSize: "14px",
          fontStyle: "bold",
          color: "#ffffff",
          stroke: "#000000",
          strokeThickness: 2,
        })
        .setOrigin(1, 1)
        .setDepth(d)
        .setScrollFactor(0);
      group.add(countText);
      bg.on("pointerdown", () => this.clearSlot(i));
      this.slotCells.push({ bg, icon, countText });
    }
    const resY = y0 + slotSize / 2 + 28;
    this.resultIcon = this.scene.add
      .image(cx - 60, resY, "__ICON_EMPTY__")
      .setDepth(d)
      .setScrollFactor(0)
      .setVisible(false);
    group.add(this.resultIcon);
    this.resultText = this.scene.add
      .text(cx - 96, resY, "", {
        fontFamily: "Monocraft",
        fontSize: "14px",
        color: "#ffe9b0",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0, 0.5)
      .setDepth(d)
      .setScrollFactor(0);
    group.add(this.resultText);
    const btnY = lowerY + lowerH / 2 - 28;
    this.craftButton = this.scene.add
      .rectangle(cx, btnY, panelW - 32, 38, 0x435d2d)
      .setDepth(d)
      .setScrollFactor(0)
      .setInteractive();
    group.add(this.craftButton);
    this.craftButtonText = this.scene.add
      .text(cx, btnY, "URET", {
        fontFamily: "Monocraft",
        fontSize: "18px",
        fontStyle: "bold",
        color: "#d8f2a5",
      })
      .setOrigin(0.5)
      .setDepth(d)
      .setScrollFactor(0);
    group.add(this.craftButtonText);
    this.craftButton.on("pointerover", () =>
      this.craftButton.setFillStyle(0x536f35),
    );
    this.craftButton.on("pointerout", () =>
      this.craftButton.setFillStyle(0x435d2d),
    );
    this.craftButton.on("pointerdown", () => this.tryCraft());
    this.infoText = this.scene.add
      .text(cx, btnY - 30, "", {
        fontFamily: "Monocraft",
        fontSize: "12px",
        color: "#ff9d88",
      })
      .setOrigin(0.5)
      .setDepth(d)
      .setScrollFactor(0);
    group.add(this.infoText);
  }

  selectRecipe(recipeId) {
    let recipe = null;
    try {
      recipe = getRecipe(recipeId);
    } catch (error) {
      return;
    }
    if (!recipe) return;
    this.selectedRecipeId = recipeId;
    this.slots = [null, null, null, null];
    const inventory = this.scene.inventory;
    let missing = false;
    recipe.inputs.forEach((input, i) => {
      if (i >= CRAFT_SLOTS) return;
      const have = inventory ? inventory.count(input.itemId) : 0;
      if (have >= input.count) {
        this.slots[i] = { itemId: input.itemId, count: input.count };
      } else {
        missing = true;
      }
    });
    for (const row of this.recipeRows) {
      if (row.bg)
        row.bg.setFillStyle(row.recipeId === recipeId ? 0x435d2d : 0x241a10);
    }
    if (this.infoText)
      this.infoText.setText(missing ? "Envanterde yeterli malzeme yok" : "");
    this.refresh();
  }

  setSlot(index, itemId, count) {
    if (index < 0 || index >= CRAFT_SLOTS) return;
    this.slots[index] = itemId
      ? { itemId, count: Math.max(1, Math.floor(count) || 1) }
      : null;
    this.selectedRecipeId = null;
    this.refresh();
  }

  clearSlot(index) {
    if (index < 0 || index >= CRAFT_SLOTS) return;
    if (this.slots[index]) {
      this.slots[index] = null;
      this.selectedRecipeId = null;
      this.refresh();
    }
  }

  clearSlots() {
    this.slots = [null, null, null, null];
    this.selectedRecipeId = null;
    this.refresh();
  }

  refresh() {
    if (!this.open || !this.group) return;
    let matched = null;
    try {
      matched = matchRecipe(this.slots);
    } catch (error) {
      matched = null;
    }
    if (matched) this.selectedRecipeId = matched.id;
    this.slotCells.forEach((cell, i) => {
      const slot = this.slots[i];
      const iconKey = slot ? this.inventoryView.iconOf(slot.itemId) : null;
      if (slot && iconKey) {
        cell.icon.setTexture(iconKey);
        this.inventoryView._fitIcon(cell.icon, 36);
        cell.icon.setVisible(true);
        cell.countText.setText(String(slot.count)).setVisible(true);
      } else if (slot) {
        cell.icon.setVisible(false);
        cell.countText.setText(String(slot.count)).setVisible(true);
      } else {
        cell.icon.setVisible(false);
        cell.countText.setText("").setVisible(false);
      }
      cell.bg.setStrokeStyle(matched ? 2 : 0, 0x4cd964, 1);
    });
    if (matched) {
      const iconKey = craftingOutputIcon(matched, (id) =>
        this.inventoryView.iconOf(id),
      );
      if (iconKey) {
        this.resultIcon.setTexture(iconKey);
        this.inventoryView._fitIcon(this.resultIcon, 32);
        this.resultIcon.setVisible(true);
      } else {
        this.resultIcon.setVisible(false);
      }
      const inText = matched.inputs
        .map(
          (input) =>
            `${input.count}x ${this.inventoryView.labelOf(input.itemId)}`,
        )
        .join(" + ");
      this.resultText.setText(
        `${inText} -> ${matched.output.count}x ${craftingOutputName(matched, (id) => this.inventoryView.labelOf(id))}`,
      );
      this.craftButton.setFillStyle(0x435d2d);
      this.craftButtonText.setColor("#d8f2a5");
    } else {
      this.resultIcon.setVisible(false);
      const anyInput = this.slots.some(Boolean);
      this.resultText.setText(
        anyInput ? "Tarif bulunamadi" : "Malzeme koy veya tarif sec",
      );
      this.craftButton.setFillStyle(0x434638);
      this.craftButtonText.setColor("#ddd8b7");
    }
    for (const row of this.recipeRows) {
      if (row.bg)
        row.bg.setFillStyle(
          row.recipeId === this.selectedRecipeId ? 0x435d2d : 0x241a10,
        );
    }
  }

  tryCraft() {
    let matched = null;
    try {
      matched = matchRecipe(this.slots);
    } catch (error) {
      matched = null;
    }
    if (!matched) {
      if (this.infoText)
        this.infoText.setText("Once gecerli bir tarif olustur");
      return;
    }
    if (this.infoText) this.infoText.setText("");
    if (this.onCraft)
      this.onCraft(
        matched.id,
        this.slots.map((s) => (s ? { ...s } : null)),
      );
  }

  onCrafted() {
    this.clearSlots();
    if (this.infoText) this.infoText.setText("");
  }

  setInfo(text) {
    if (this.infoText) this.infoText.setText(text || "");
  }

  close() {
    if (!this.open) return;
    this.open = false;
    if (this.group) {
      this.group.destroy(true);
      this.group = null;
    }
    this.recipeRows = [];
    this.slotCells = [];
    this.resultIcon = null;
    this.resultText = null;
    this.craftButton = null;
    this.craftButtonText = null;
    this.infoText = null;
    this.selectedRecipeId = null;
    this.slots = [null, null, null, null];
  }
}
