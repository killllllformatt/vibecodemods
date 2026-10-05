-- GOOFY MAIN MENU  |  Put this LocalScript in StarterPlayer > StarterPlayerScripts
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")
local StarterGui = game:GetService("StarterGui")

local GAME_TITLE = "GOOFY GAME"
local CREDITS = {
	{"Made by", "You!"},
	{"Lead Wobbler", "The Title Letters"},
	{"Cloud Wrangler", "Some Guy Named Gary"},
	{"Snacks", "Mom"},
	{"Special Thanks", "You, for clicking this"},
}
local TAGLINES = {"Now with 40% more wobble!", "No noobs were harmed", "Press PLAY. Or don't.", "Certified goofy since 2026", "Warning: may contain bacon hair"}

local INK = Color3.fromRGB(27, 27, 58)
local COLORS = {
	Color3.fromRGB(255, 210, 63), Color3.fromRGB(255, 79, 163), Color3.fromRGB(61, 220, 78),
	Color3.fromRGB(255, 138, 61), Color3.fromRGB(181, 123, 255), Color3.fromRGB(94, 200, 255),
}

local player = Players.LocalPlayer
local camera = workspace.CurrentCamera

-- PlayerModule can be slow to show up / fail to require; don't let that kill the whole menu
local controls
pcall(function()
	controls = require(player:WaitForChild("PlayerScripts"):WaitForChild("PlayerModule", 10)):GetControls()
end)
if controls then controls:Disable() end

-- SetCore stuff can error if the CoreScripts aren't ready yet, so retry for a few seconds
local function setCoreGui(enabled)
	for _ = 1, 20 do
		if pcall(function() StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.All, enabled) end) then return end
		task.wait(0.25)
	end
end
task.spawn(setCoreGui, false)

local function tween(obj, t, props, style, dir, reps, rev)
	local tw = TweenService:Create(obj, TweenInfo.new(t, style or Enum.EasingStyle.Sine, dir or Enum.EasingDirection.InOut, reps or 0, rev or false), props)
	tw:Play()
	return tw
end
local function corner(p, r) local c = Instance.new("UICorner") c.CornerRadius = UDim.new(0, r) c.Parent = p end
local function stroke(p, th, mode)
	local s = Instance.new("UIStroke") s.Color = INK s.Thickness = th
	s.ApplyStrokeMode = mode or Enum.ApplyStrokeMode.Border s.Parent = p return s
end
local function scale(p) local s = Instance.new("UIScale") s.Parent = p return s end

local gui = Instance.new("ScreenGui")
gui.Name = "MainMenu" gui.IgnoreGuiInset = true gui.ResetOnSpawn = false
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.DisplayOrder = 100
gui.Parent = player:WaitForChild("PlayerGui")

local bg = Instance.new("Frame")
bg.Size = UDim2.fromScale(1, 1) bg.BorderSizePixel = 0 bg.BackgroundColor3 = Color3.new(1, 1, 1)
bg.ClipsDescendants = true bg.Parent = gui
local grad = Instance.new("UIGradient")
grad.Rotation = 90
grad.Color = ColorSequence.new({
	ColorSequenceKeypoint.new(0, Color3.fromRGB(94, 200, 255)),
	ColorSequenceKeypoint.new(0.69, Color3.fromRGB(168, 228, 255)),
	ColorSequenceKeypoint.new(0.7, Color3.fromRGB(126, 219, 106)),
	ColorSequenceKeypoint.new(1, Color3.fromRGB(92, 194, 74)),
})
grad.Parent = bg

-- spinning sun rays
local rays = Instance.new("Frame")
rays.AnchorPoint = Vector2.new(0.5, 0.5) rays.Position = UDim2.fromScale(0.5, 0.34)
rays.Size = UDim2.fromScale(3, 3) rays.SizeConstraint = Enum.SizeConstraint.RelativeXX
rays.BackgroundTransparency = 1 rays.Parent = bg
for i = 0, 17 do
	local ray = Instance.new("Frame")
	ray.AnchorPoint = Vector2.new(0.5, 0.5) ray.Position = UDim2.fromScale(0.5, 0.5)
	ray.Size = UDim2.new(0.06, 0, 1, 0) ray.Rotation = i * 10
	ray.BackgroundColor3 = Color3.new(1, 1, 1) ray.BackgroundTransparency = 0.8 ray.BorderSizePixel = 0
	ray.Parent = rays
end

-- drifting clouds
local clouds = {}
for i = 0, 3 do
	local cloud = Instance.new("Frame")
	cloud.BackgroundTransparency = 1 cloud.Size = UDim2.fromOffset(200, 100)
	cloud.Position = UDim2.new(math.random(), 0, 0.06 + i * 0.13, 0) cloud.Parent = bg
	for _, d in ipairs({{0, 30, 70}, {45, 0, 100}, {110, 30, 70}}) do
		local puff = Instance.new("Frame")
		puff.Position = UDim2.fromOffset(d[1], d[2]) puff.Size = UDim2.fromOffset(d[3], d[3])
		puff.BackgroundColor3 = Color3.new(1, 1, 1) puff.BorderSizePixel = 0 puff.Parent = cloud
		corner(puff, 999)
	end
	table.insert(clouds, {frame = cloud, speed = 0.02 + i * 0.008})
end

-- floating spinning blocks
for i = 1, 10 do
	local b = Instance.new("Frame")
	local s = math.random(30, 70)
	b.Size = UDim2.fromOffset(s, s) b.AnchorPoint = Vector2.new(0.5, 0.5)
	local y = (i % 2 == 0) and (0.08 + math.random() * 0.25) or (0.62 + math.random() * 0.25)
	b.Position = UDim2.fromScale((i - 0.5) / 10, y)
	b.BackgroundColor3 = COLORS[(i - 1) % #COLORS + 1] b.Parent = bg
	corner(b, 10) stroke(b, 4)
	local dur = 2 + math.random() * 2
	tween(b, dur, {Position = UDim2.fromScale((i - 0.5) / 10, y - 0.05), Rotation = 180}, nil, nil, -1, true)
end

-- content column
local content = Instance.new("Frame")
content.Size = UDim2.fromScale(1, 1) content.BackgroundTransparency = 1 content.Parent = gui
local list = Instance.new("UIListLayout")
list.FillDirection = Enum.FillDirection.Vertical list.HorizontalAlignment = Enum.HorizontalAlignment.Center
list.VerticalAlignment = Enum.VerticalAlignment.Center list.Padding = UDim.new(0, 26)
list.SortOrder = Enum.SortOrder.LayoutOrder list.Parent = content

-- bobbing title letters
local titleRow = Instance.new("Frame")
titleRow.BackgroundTransparency = 1 titleRow.Size = UDim2.new(1, 0, 0, 140) titleRow.LayoutOrder = 1 titleRow.Parent = content
local rowList = Instance.new("UIListLayout")
rowList.FillDirection = Enum.FillDirection.Horizontal rowList.HorizontalAlignment = Enum.HorizontalAlignment.Center
rowList.VerticalAlignment = Enum.VerticalAlignment.Center rowList.SortOrder = Enum.SortOrder.LayoutOrder rowList.Parent = titleRow
for i = 1, #GAME_TITLE do
	local ch = GAME_TITLE:sub(i, i)
	local holder = Instance.new("Frame")
	holder.BackgroundTransparency = 1 holder.LayoutOrder = i
	holder.Size = UDim2.fromOffset(ch == " " and 40 or 80, 130) holder.Parent = titleRow
	if ch ~= " " then
		local l = Instance.new("TextLabel")
		l.Text = ch l.Font = Enum.Font.FredokaOne l.TextScaled = true
		l.TextColor3 = COLORS[(i - 1) % 5 + 1] l.BackgroundTransparency = 1
		l.Size = UDim2.fromScale(1, 1) l.AnchorPoint = Vector2.new(0.5, 0.5) l.Position = UDim2.fromScale(0.5, 0.5)
		l.Rotation = -4 l.Parent = holder
		stroke(l, 5, Enum.ApplyStrokeMode.Contextual)
		task.delay(i * 0.12, function()
			if l.Parent then
				tween(l, 0.8, {Position = UDim2.new(0.5, 0, 0.5, -20), Rotation = 5}, nil, nil, -1, true)
			end
		end)
	end
end

-- wobbling tagline (click to change)
local tag = Instance.new("TextButton")
tag.AutoButtonColor = false tag.LayoutOrder = 2
tag.Size = UDim2.fromOffset(440, 46) tag.BackgroundColor3 = COLORS[1]
tag.Font = Enum.Font.FredokaOne tag.TextSize = 24 tag.TextColor3 = INK tag.Text = TAGLINES[1]
tag.Parent = content corner(tag, 14) stroke(tag, 4)
tag.Rotation = -3
tween(tag, 1.2, {Rotation = 3}, nil, nil, -1, true)
local tagIndex = 1
tag.Activated:Connect(function()
	tagIndex = tagIndex % #TAGLINES + 1
	tag.Text = TAGLINES[tagIndex]
end)

local function makeButton(text, color, w, h, size, order)
	local b = Instance.new("TextButton")
	b.Text = text b.Font = Enum.Font.FredokaOne b.TextSize = size b.TextColor3 = Color3.new(1, 1, 1)
	b.BackgroundColor3 = color b.Size = UDim2.fromOffset(w, h) b.AutoButtonColor = false
	b.LayoutOrder = order b.Parent = content
	corner(b, 26) stroke(b, 5)
	-- outline on the text itself (a UIStroke can only do border OR text, so the text one lives on a child label)
	b.TextTransparency = 1
	local txt = Instance.new("TextLabel")
	txt.Text = text txt.Font = Enum.Font.FredokaOne txt.TextSize = size txt.TextColor3 = Color3.new(1, 1, 1)
	txt.BackgroundTransparency = 1 txt.Size = UDim2.fromScale(1, 1) txt.Parent = b
	stroke(txt, 3, Enum.ApplyStrokeMode.Contextual)
	local sc = scale(b)
	b.MouseEnter:Connect(function() tween(sc, 0.15, {Scale = 1.12}, Enum.EasingStyle.Back, Enum.EasingDirection.Out) tween(b, 0.15, {Rotation = -4}) end)
	b.MouseLeave:Connect(function() tween(sc, 0.15, {Scale = 1}) tween(b, 0.15, {Rotation = 0}) end)
	b.MouseButton1Down:Connect(function() tween(sc, 0.08, {Scale = 0.9}) end)
	b.MouseButton1Up:Connect(function() tween(sc, 0.2, {Scale = 1.12}, Enum.EasingStyle.Back, Enum.EasingDirection.Out) end)
	return b, sc
end

local play = makeButton("PLAY!", COLORS[3], 300, 90, 56, 3)
local credits = makeButton("Credits", COLORS[2], 220, 60, 32, 4)

-- PLAY button heartbeat pulse
tween(play, 0.55, {Size = UDim2.fromOffset(320, 96)}, nil, nil, -1, true)

-- credits panel
local overlay = Instance.new("TextButton")
overlay.Text = "" overlay.AutoButtonColor = false overlay.Size = UDim2.fromScale(1, 1)
overlay.BackgroundColor3 = INK overlay.BackgroundTransparency = 1 overlay.Visible = false
overlay.ZIndex = 10 overlay.Parent = gui

local panel = Instance.new("Frame")
panel.AnchorPoint = Vector2.new(0.5, 0.5) panel.Size = UDim2.fromOffset(520, 380)
panel.Position = UDim2.fromScale(0.5, 1.6) panel.BackgroundColor3 = Color3.new(1, 1, 1)
panel.Active = true -- eat clicks so clicking the panel doesn't close it
panel.ZIndex = 11 panel.Parent = overlay corner(panel, 28) stroke(panel, 6)

local ctitle = Instance.new("TextLabel")
ctitle.Text = "CREDITS" ctitle.Font = Enum.Font.FredokaOne ctitle.TextSize = 48
ctitle.TextColor3 = COLORS[2] ctitle.BackgroundTransparency = 1
ctitle.Size = UDim2.new(1, 0, 0, 70) ctitle.ZIndex = 12 ctitle.Parent = panel
stroke(ctitle, 4, Enum.ApplyStrokeMode.Contextual)
ctitle.Rotation = -4
tween(ctitle, 0.7, {Rotation = 4}, nil, nil, -1, true)

local window = Instance.new("Frame")
window.ClipsDescendants = true window.BackgroundTransparency = 1
window.Position = UDim2.fromOffset(0, 80) window.Size = UDim2.new(1, 0, 1, -100) window.ZIndex = 12 window.Parent = panel

local roll = Instance.new("Frame")
roll.BackgroundTransparency = 1 roll.Size = UDim2.new(1, 0, 0, #CREDITS * 70) roll.ZIndex = 12 roll.Parent = window
for i, c in ipairs(CREDITS) do
	local role = Instance.new("TextLabel")
	role.Text = c[1] role.Font = Enum.Font.FredokaOne role.TextSize = 18 role.TextColor3 = Color3.fromRGB(107, 107, 138)
	role.BackgroundTransparency = 1 role.Size = UDim2.new(1, 0, 0, 22) role.Position = UDim2.fromOffset(0, (i - 1) * 70)
	role.ZIndex = 12 role.Parent = roll
	local name = role:Clone()
	name.Text = c[2] name.Font = Enum.Font.FredokaOne name.TextSize = 28 name.TextColor3 = INK
	name.Size = UDim2.new(1, 0, 0, 34) name.Position = UDim2.fromOffset(0, (i - 1) * 70 + 22) name.Parent = roll
end

local close = Instance.new("TextButton")
close.Text = "X" close.Font = Enum.Font.FredokaOne close.TextSize = 28 close.TextColor3 = INK
close.BackgroundColor3 = COLORS[1] close.Size = UDim2.fromOffset(56, 56) close.AnchorPoint = Vector2.new(0.5, 0.5)
close.Position = UDim2.new(1, -6, 0, 6) close.ZIndex = 13 close.Parent = panel
corner(close, 999) stroke(close, 5)
close.MouseEnter:Connect(function() tween(close, 0.2, {Rotation = 90}) end)
close.MouseLeave:Connect(function() tween(close, 0.2, {Rotation = 0}) end)

local rollTween
local creditsOpen, creditsBusy = false, false
local function openCredits()
	if creditsOpen or creditsBusy then return end
	creditsOpen = true
	overlay.Visible = true
	tween(overlay, 0.3, {BackgroundTransparency = 0.45})
	panel.Rotation = 8
	tween(panel, 0.5, {Position = UDim2.fromScale(0.5, 0.5), Rotation = -1}, Enum.EasingStyle.Back, Enum.EasingDirection.Out)
	if rollTween then rollTween:Cancel() end
	roll.Position = UDim2.new(0, 0, 1, 0)
	rollTween = tween(roll, 9, {Position = UDim2.new(0, 0, 0, -roll.Size.Y.Offset)}, Enum.EasingStyle.Linear, nil, -1)
end
local function closeCredits()
	if not creditsOpen or creditsBusy then return end
	creditsBusy = true
	tween(overlay, 0.25, {BackgroundTransparency = 1})
	local t = tween(panel, 0.35, {Position = UDim2.fromScale(0.5, 1.6), Rotation = 8}, Enum.EasingStyle.Back, Enum.EasingDirection.In)
	t.Completed:Wait()
	if rollTween then rollTween:Cancel() rollTween = nil end
	overlay.Visible = false
	creditsOpen, creditsBusy = false, false
end
credits.Activated:Connect(openCredits)
close.Activated:Connect(closeCredits)
overlay.Activated:Connect(closeCredits)

-- per-frame: spin rays, drift clouds, slow camera orbit
local orbit = 0
local menuCF = workspace:FindFirstChild("MenuCamera") -- optional Part named MenuCamera
local conn = RunService.RenderStepped:Connect(function(dt)
	rays.Rotation = (rays.Rotation + dt * 9) % 360
	for _, c in ipairs(clouds) do
		local x = c.frame.Position.X.Scale + c.speed * dt
		if x > 1.1 then x = -0.3 end
		c.frame.Position = UDim2.new(x, 0, c.frame.Position.Y.Scale, 0)
	end
	orbit += dt * 0.1
	if menuCF and menuCF:IsA("BasePart") then
		camera = workspace.CurrentCamera
		-- the default camera scripts flip this back to Custom when your character spawns, so keep forcing it
		camera.CameraType = Enum.CameraType.Scriptable
		camera.CFrame = menuCF.CFrame * CFrame.Angles(0, math.sin(orbit) * 0.15, 0)
	end
end)

-- PLAY: everything yeets off screen, then hand control back
local playing = false
play.Activated:Connect(function()
	if playing then return end
	playing = true
	play.Active = false
	if creditsOpen then overlay.Visible = false end
	tween(content, 0.5, {Position = UDim2.fromScale(0, 1.3)}, Enum.EasingStyle.Back, Enum.EasingDirection.In)
	task.wait(0.35)
	local fade = tween(bg, 0.5, {BackgroundTransparency = 1})
	for _, d in ipairs(bg:GetDescendants()) do
		if d:IsA("Frame") then tween(d, 0.5, {BackgroundTransparency = 1}) end
		if d:IsA("UIStroke") then tween(d, 0.5, {Transparency = 1}) end
	end
	fade.Completed:Wait()
	conn:Disconnect()
	gui:Destroy()
	workspace.CurrentCamera.CameraType = Enum.CameraType.Custom
	task.spawn(setCoreGui, true)
	if controls then controls:Enable() end
end)
