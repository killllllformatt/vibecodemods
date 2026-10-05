-- MAIN MENU  |  LocalScript in StarterPlayer > StarterPlayerScripts
-- Two buttons (PLAY + CREDITS) with popping animations.
-- Works on PC, phone, tablet and console: everything is laid out on a 1000x700 canvas that scales to fit the screen.
-- Optional: put an anchored, invisible Part named "MenuCamera" in Workspace to show your map behind the menu.

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")
local StarterGui = game:GetService("StarterGui")
local GuiService = game:GetService("GuiService")
local UserInputService = game:GetService("UserInputService")
local TextService = game:GetService("TextService")
local SoundService = game:GetService("SoundService")

---------------------------------------------------------------- settings
local GAME_TITLE = "PLACEHOLDER"
local CREDITS = {
	{"Created by", "Placeholder"},
	{"Scripting", "Placeholder"},
	{"Building", "Placeholder"},
	{"Special Thanks", "Placeholder"},
}
-- Paste your own sound IDs here (Creator Store > Audio). Leave nil to skip.
local SOUNDS = {
	hover = nil, -- "rbxassetid://..."
	click = nil,
}

local INK = Color3.fromRGB(27, 27, 58)
local WHITE = Color3.new(1, 1, 1)
local GRAY = Color3.fromRGB(120, 120, 150)
local SKY_TOP = Color3.fromRGB(86, 110, 255)
local SKY_BOTTOM = Color3.fromRGB(160, 96, 255)
local PLAY_COLOR = Color3.fromRGB(61, 214, 110)
local CLOSE_COLOR = Color3.fromRGB(255, 92, 120)
local FONT = Enum.Font.FredokaOne

local CANVAS = Vector2.new(1000, 700)
local MAX_SCALE = 1.4 -- stops the menu getting huge on 4K screens
local DEPTH = 8 -- how far buttons "press down"

---------------------------------------------------------------- helpers
local player = Players.LocalPlayer

local function tween(obj, t, props, style, dir, reps, rev, delay)
	local tw = TweenService:Create(obj, TweenInfo.new(t, style or Enum.EasingStyle.Quad, dir or Enum.EasingDirection.Out, reps or 0, rev or false, delay or 0), props)
	tw:Play()
	return tw
end
local function new(class, props, parent)
	local o = Instance.new(class)
	for k, v in pairs(props) do o[k] = v end
	o.Parent = parent
	return o
end
local function corner(p, r) new("UICorner", {CornerRadius = UDim.new(0, r)}, p) end
local function outline(p, th) new("UIStroke", {Color = INK, Thickness = th, ApplyStrokeMode = Enum.ApplyStrokeMode.Border}, p) end
local function textOutline(p, th) new("UIStroke", {Color = INK, Thickness = th, ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual}, p) end
local function playSound(name)
	local id = SOUNDS[name]
	if not id then return end
	local s = new("Sound", {SoundId = id, Volume = 0.6}, SoundService)
	s:Play()
	s.Ended:Once(function() s:Destroy() end)
end
local function selectIfGamepad(obj)
	if UserInputService.GamepadEnabled then GuiService.SelectedObject = obj end
end

---------------------------------------------------------------- lock the player while the menu is up
print("[MainMenu] running") -- if you don't see this in Output, the script isn't running at all
-- freeze movement in the background so the menu never waits on it
local controls
task.spawn(function()
	local ok, module = pcall(function()
		return require(player:WaitForChild("PlayerScripts"):WaitForChild("PlayerModule", 10))
	end)
	if ok and module then
		controls = module:GetControls()
		if player:GetAttribute("InMenu") then controls:Disable() end
	end
end)
pcall(function() StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.All, false) end)
player:SetAttribute("InMenu", true) -- other LocalScripts can check this

local gui = new("ScreenGui", {Name = "MainMenu", IgnoreGuiInset = true, ResetOnSpawn = false, DisplayOrder = 10, ZIndexBehavior = Enum.ZIndexBehavior.Sibling}, player:WaitForChild("PlayerGui"))

-- canvases: fixed-size frames that get scaled to fit any screen
local canvasScales = {}
local function makeCanvas(parent)
	local c = new("Frame", {AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.fromOffset(CANVAS.X, CANVAS.Y), BackgroundTransparency = 1}, parent)
	table.insert(canvasScales, new("UIScale", {}, c))
	return c
end
-- runs every frame: Roblox can swap the camera (and screen size) right after you join
local function fit()
	local camera = workspace.CurrentCamera
	if not camera then return end
	local vp = camera.ViewportSize
	if vp.X < 10 or vp.Y < 10 then return end -- screen not ready yet
	local s = math.min(vp.X / CANVAS.X, vp.Y / CANVAS.Y, MAX_SCALE)
	for _, sc in ipairs(canvasScales) do sc.Scale = s end
end

-- invisible selection box: buttons grow when a controller selects them instead
local noSelect = new("Frame", {BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1)}, nil)

---------------------------------------------------------------- background
local menuPart = workspace:FindFirstChild("MenuCamera")
local bgTransparency = menuPart and 0.35 or 0
local bg = new("Frame", {Size = UDim2.fromScale(1, 1), BackgroundColor3 = WHITE, BackgroundTransparency = bgTransparency, BorderSizePixel = 0}, gui)
new("UIGradient", {Rotation = 90, Color = ColorSequence.new(SKY_TOP, SKY_BOTTOM)}, bg)

-- soft bubbles drifting upward
local bubbles = {}
for _ = 1, 12 do
	local size = math.random(60, 180)
	local x = math.random()
	local b = new("Frame", {AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(x, math.random() * 1.2), Size = UDim2.fromOffset(size, size), BackgroundColor3 = WHITE, BackgroundTransparency = 0.88, BorderSizePixel = 0}, bg)
	corner(b, 999)
	table.insert(bubbles, {frame = b, x = x, speed = 0.01 + math.random() * 0.02, phase = math.random() * math.pi * 2})
end

---------------------------------------------------------------- buttons
-- A chunky button with a darker "base" under it. Pops in/out, grows on hover, presses down on click.
local function makeButton(parent, o)
	local holder = new("Frame", {AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromOffset(o.position.X, o.position.Y), Size = UDim2.fromOffset(o.size.X, o.size.Y), BackgroundTransparency = 1, ZIndex = 5}, parent)
	local pop = new("UIScale", {Scale = 0}, holder)
	local inner = new("Frame", {Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1}, holder)
	local hover = new("UIScale", {}, inner)

	local base = new("Frame", {Position = UDim2.fromOffset(0, DEPTH), Size = UDim2.fromScale(1, 1), BackgroundColor3 = o.color:Lerp(INK, 0.35)}, inner)
	corner(base, o.radius) outline(base, 4)
	local face = new("TextButton", {Size = UDim2.fromScale(1, 1), BackgroundColor3 = o.color, AutoButtonColor = false, Text = o.text, Font = FONT, TextSize = o.textSize, TextColor3 = o.textColor, SelectionImageObject = noSelect, ZIndex = 2}, inner)
	corner(face, o.radius) outline(face, 4)
	if o.textColor == WHITE then textOutline(face, 3) end
	-- glossy highlight along the top
	local gloss = new("Frame", {Position = UDim2.new(0, 10, 0, 6), Size = UDim2.new(1, -20, 0.32, 0), BackgroundColor3 = WHITE, BackgroundTransparency = 0.8, BorderSizePixel = 0}, face)
	corner(gloss, o.radius)

	local enabled, pressed = false, false
	local function setHover(on)
		if not enabled and on then return end
		tween(hover, 0.2, {Scale = on and 1.08 or 1}, Enum.EasingStyle.Back)
		tween(inner, 0.2, {Rotation = on and -2 or 0}, Enum.EasingStyle.Back)
		if on then playSound("hover") end
	end
	local function press(down)
		pressed = down
		if down then
			tween(face, 0.06, {Position = UDim2.fromOffset(0, DEPTH)})
		else
			tween(face, 0.25, {Position = UDim2.fromOffset(0, 0)}, Enum.EasingStyle.Back)
		end
	end
	local function isPointer(input)
		return input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch
	end

	face.MouseEnter:Connect(function() if UserInputService.MouseEnabled then setHover(true) end end)
	face.MouseLeave:Connect(function() setHover(false) if pressed then press(false) end end)
	face.SelectionGained:Connect(function() setHover(true) end)
	face.SelectionLost:Connect(function() setHover(false) end)
	face.InputBegan:Connect(function(input) if enabled and isPointer(input) then press(true) end end)
	face.InputEnded:Connect(function(input) if pressed and isPointer(input) then press(false) end end)

	local button = {face = face}
	function button.onClick(fn)
		face.Activated:Connect(function()
			if not enabled then return end
			playSound("click")
			-- controller/keyboard clicks don't send a mouse press, so fake a quick one
			local last = UserInputService:GetLastInputType()
			if last == Enum.UserInputType.Keyboard or last.Name:find("Gamepad") then
				press(true)
				task.delay(0.07, press, false)
			end
			fn()
		end)
	end
	function button.show(delay)
		face.Position = UDim2.fromOffset(0, 0)
		tween(pop, 0.5, {Scale = 1}, Enum.EasingStyle.Back, Enum.EasingDirection.Out, 0, false, delay)
		task.delay(delay + 0.3, function() enabled = true end)
	end
	function button.hide(delay)
		enabled = false
		setHover(false)
		return tween(pop, 0.25, {Scale = 0}, Enum.EasingStyle.Back, Enum.EasingDirection.In, 0, false, delay)
	end
	function button.addShine()
		local shine = new("Frame", {Size = UDim2.fromScale(1, 1), BackgroundColor3 = WHITE, ZIndex = 3}, face)
		corner(shine, o.radius)
		local g = new("UIGradient", {Rotation = 20, Offset = Vector2.new(-1.2, 0), Transparency = NumberSequence.new({
			NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(0.42, 1), NumberSequenceKeypoint.new(0.5, 0.4),
			NumberSequenceKeypoint.new(0.58, 1), NumberSequenceKeypoint.new(1, 1)})}, shine)
		task.spawn(function()
			while shine.Parent do
				g.Offset = Vector2.new(-1.2, 0)
				tween(g, 0.7, {Offset = Vector2.new(1.2, 0)}, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut)
				task.wait(2.5)
			end
		end)
	end
	return button
end

---------------------------------------------------------------- menu: title + buttons
local menu = makeCanvas(gui)

local TITLE_SIZE = 120
local title = new("Frame", {AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromOffset(CANVAS.X / 2, 210), Size = UDim2.fromOffset(CANVAS.X, 150), BackgroundTransparency = 1}, menu)
new("UIListLayout", {FillDirection = Enum.FillDirection.Horizontal, HorizontalAlignment = Enum.HorizontalAlignment.Center, VerticalAlignment = Enum.VerticalAlignment.Center, SortOrder = Enum.SortOrder.LayoutOrder, Padding = UDim.new(0, 2)}, title)
local letters = {}
local titleWidth = 0
for i = 1, #GAME_TITLE do
	local ch = GAME_TITLE:sub(i, i)
	local w = ch == " " and TITLE_SIZE * 0.35 or TextService:GetTextSize(ch, TITLE_SIZE, FONT, Vector2.new(1000, 1000)).X
	titleWidth += w + 2
	local holder = new("Frame", {LayoutOrder = i, Size = UDim2.fromOffset(w, 150), BackgroundTransparency = 1}, title)
	if ch ~= " " then
		local l = new("TextLabel", {AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Text = ch, Font = FONT, TextSize = TITLE_SIZE, TextColor3 = WHITE}, holder)
		textOutline(l, 6)
		table.insert(letters, {label = l, scale = new("UIScale", {Scale = 0}, l)})
	end
end
-- long titles shrink to fit
if titleWidth > CANVAS.X - 80 then new("UIScale", {Scale = (CANVAS.X - 80) / titleWidth}, title) end

local playButton = makeButton(menu, {text = "PLAY", color = PLAY_COLOR, textColor = WHITE, size = Vector2.new(340, 100), textSize = 56, radius = 26, position = Vector2.new(CANVAS.X / 2, 430)})
playButton.addShine()
local creditsButton = makeButton(menu, {text = "CREDITS", color = WHITE, textColor = INK, size = Vector2.new(260, 76), textSize = 36, radius = 22, position = Vector2.new(CANVAS.X / 2, 555)})

---------------------------------------------------------------- credits popup
local overlay = new("TextButton", {Text = "", AutoButtonColor = false, Selectable = false, Size = UDim2.fromScale(1, 1), BackgroundColor3 = INK, BackgroundTransparency = 1, Visible = false, ZIndex = 10}, gui)
local panelCanvas = makeCanvas(overlay)

local PANEL = Vector2.new(560, 140 + #CREDITS * 84)
local panelHolder = new("Frame", {AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromOffset(CANVAS.X / 2, CANVAS.Y / 2), Size = UDim2.fromOffset(PANEL.X, PANEL.Y), BackgroundTransparency = 1}, panelCanvas)
local panelPop = new("UIScale", {Scale = 0}, panelHolder)
local panelBase = new("Frame", {Position = UDim2.fromOffset(0, DEPTH + 2), Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.fromRGB(200, 200, 225)}, panelHolder)
corner(panelBase, 32) outline(panelBase, 5)
-- Active = true so clicks on the panel don't fall through to the overlay (which closes it)
local panel = new("Frame", {Size = UDim2.fromScale(1, 1), BackgroundColor3 = WHITE, Active = true, ZIndex = 2}, panelHolder)
corner(panel, 32) outline(panel, 5)

local header = new("TextLabel", {Position = UDim2.fromOffset(0, 24), Size = UDim2.new(1, 0, 0, 64), BackgroundTransparency = 1, Text = "CREDITS", Font = FONT, TextSize = 54, TextColor3 = SKY_TOP}, panel)
textOutline(header, 4)

local rows = {}
for i, c in ipairs(CREDITS) do
	local row = new("Frame", {AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.fromOffset(PANEL.X / 2, 108 + (i - 1) * 84), Size = UDim2.fromOffset(PANEL.X - 80, 76), BackgroundTransparency = 1}, panel)
	new("TextLabel", {Size = UDim2.new(1, 0, 0, 26), BackgroundTransparency = 1, Text = c[1], Font = FONT, TextSize = 22, TextColor3 = GRAY}, row)
	new("TextLabel", {Position = UDim2.fromOffset(0, 26), Size = UDim2.new(1, 0, 0, 40), BackgroundTransparency = 1, Text = c[2], Font = FONT, TextSize = 36, TextColor3 = INK}, row)
	table.insert(rows, new("UIScale", {Scale = 0}, row))
end

local closeButton = makeButton(panel, {text = "X", color = CLOSE_COLOR, textColor = WHITE, size = Vector2.new(64, 64), textSize = 34, radius = 32, position = Vector2.new(PANEL.X - 12, 12)})

local busy = false
local function setMenuSelectable(on)
	playButton.face.Selectable = on
	creditsButton.face.Selectable = on
end

local function openCredits()
	if busy or overlay.Visible then return end
	busy = true
	setMenuSelectable(false)
	overlay.Visible = true
	tween(overlay, 0.3, {BackgroundTransparency = 0.45})
	panelHolder.Rotation = -6
	tween(panelPop, 0.5, {Scale = 1}, Enum.EasingStyle.Back)
	tween(panelHolder, 0.7, {Rotation = 0}, Enum.EasingStyle.Elastic)
	for i, sc in ipairs(rows) do
		sc.Scale = 0
		tween(sc, 0.4, {Scale = 1}, Enum.EasingStyle.Back, Enum.EasingDirection.Out, 0, false, 0.15 + i * 0.07)
	end
	closeButton.show(0.3)
	task.delay(0.6, function()
		busy = false
		selectIfGamepad(closeButton.face)
	end)
end

local function closeCredits()
	if busy or not overlay.Visible then return end
	busy = true
	closeButton.hide(0)
	tween(overlay, 0.25, {BackgroundTransparency = 1})
	tween(panelPop, 0.25, {Scale = 0}, Enum.EasingStyle.Back, Enum.EasingDirection.In).Completed:Wait()
	overlay.Visible = false
	setMenuSelectable(true)
	busy = false
	selectIfGamepad(creditsButton.face)
end

creditsButton.onClick(openCredits)
closeButton.onClick(closeCredits)
overlay.Activated:Connect(closeCredits) -- click outside the panel to close
local backConn = UserInputService.InputBegan:Connect(function(input)
	if input.KeyCode == Enum.KeyCode.ButtonB or input.KeyCode == Enum.KeyCode.Escape then task.spawn(closeCredits) end
end)

---------------------------------------------------------------- intro
fit()

-- letters pop in one by one, then settle into a gentle wave
for i, l in ipairs(letters) do
	local d = 0.15 + i * 0.06
	l.label.Rotation = math.random(-25, 25)
	tween(l.scale, 0.45, {Scale = 1}, Enum.EasingStyle.Back, Enum.EasingDirection.Out, 0, false, d)
	tween(l.label, 0.7, {Rotation = 0}, Enum.EasingStyle.Elastic, Enum.EasingDirection.Out, 0, false, d)
	task.delay(d + 0.7, function()
		if l.label.Parent then
			tween(l.label, 1.1, {Position = UDim2.new(0.5, 0, 0.5, -8)}, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true)
		end
	end)
end
local buttonsAt = 0.25 + #letters * 0.06
playButton.show(buttonsAt)
creditsButton.show(buttonsAt + 0.12)
task.delay(buttonsAt + 0.5, selectIfGamepad, playButton.face)

---------------------------------------------------------------- per frame: drift bubbles, sway the menu camera
local t = 0
local loop = RunService.RenderStepped:Connect(function(dt)
	t += dt
	fit()
	for _, b in ipairs(bubbles) do
		local y = b.frame.Position.Y.Scale - b.speed * dt
		if y < -0.2 then y = 1.2 end
		b.frame.Position = UDim2.fromScale(b.x + math.sin(t * 0.6 + b.phase) * 0.02, y)
	end
	if menuPart then
		local camera = workspace.CurrentCamera
		camera.CameraType = Enum.CameraType.Scriptable
		camera.CFrame = menuPart.CFrame * CFrame.Angles(0, math.sin(t * 0.1) * 0.15, 0)
	end
end)

---------------------------------------------------------------- PLAY: everything pops away, then hand control back
local started = false
playButton.onClick(function()
	if started or busy or overlay.Visible then return end
	started = true
	GuiService.SelectedObject = nil
	creditsButton.hide(0)
	playButton.hide(0.06)
	for i, l in ipairs(letters) do
		tween(l.scale, 0.25, {Scale = 0}, Enum.EasingStyle.Back, Enum.EasingDirection.In, 0, false, (#letters - i) * 0.025)
	end
	task.wait(0.45)
	tween(bg, 0.5, {BackgroundTransparency = 1})
	for _, b in ipairs(bubbles) do tween(b.frame, 0.4, {BackgroundTransparency = 1}) end
	task.wait(0.5)

	loop:Disconnect()
	backConn:Disconnect()
	gui:Destroy()
	if menuPart then workspace.CurrentCamera.CameraType = Enum.CameraType.Custom end
	pcall(function() StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.All, true) end)
	if controls then controls:Enable() end
	player:SetAttribute("InMenu", false)
end)
