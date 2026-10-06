#if UNITY_EDITOR
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class NecpraSceneBuilder
{
    static readonly Dictionary<string, Material> mats = new Dictionary<string, Material>();

    static Material Mat(string name, Color c, float metallic = 0f, float smooth = 0.25f)
    {
        if (mats.TryGetValue(name, out var cached)) return cached;
        if (!AssetDatabase.IsValidFolder("Assets/Materials")) AssetDatabase.CreateFolder("Assets", "Materials");
        string path = "Assets/Materials/" + name + ".mat";
        var m = AssetDatabase.LoadAssetAtPath<Material>(path);
        if (m == null)
        {
            var sh = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            m = new Material(sh); AssetDatabase.CreateAsset(m, path);
        }
        m.color = c;
        if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", metallic);
        if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", smooth);
        mats[name] = m; return m;
    }

    static GameObject Prim(PrimitiveType t, string name, Vector3 pos, Vector3 scale, Material mat, Transform parent = null)
    {
        var g = GameObject.CreatePrimitive(t);
        g.name = name; g.transform.position = pos; g.transform.localScale = scale;
        g.GetComponent<Renderer>().sharedMaterial = mat;
        if (parent) g.transform.SetParent(parent, true);
        return g;
    }

    static Transform Point(string name, Vector3 pos, Transform parent)
    {
        var g = new GameObject(name); g.transform.position = pos; g.transform.SetParent(parent, true); return g.transform;
    }

    static void Wall(string name, Vector3 pos, Vector3 scale, Material mat) => Prim(PrimitiveType.Cube, name, pos, scale, mat);

    static void Chair(Vector3 pos, float ry, Material mat)
    {
        var seat = Prim(PrimitiveType.Cube, "Chair", pos, new Vector3(0.65f, 0.45f, 0.65f), mat);
        seat.transform.rotation = Quaternion.Euler(0, ry, 0);
        var back = Prim(PrimitiveType.Cube, "ChairBack", pos + seat.transform.forward * -0.27f + Vector3.up * 0.55f, new Vector3(0.65f, 0.7f, 0.12f), mat);
        back.transform.rotation = Quaternion.Euler(0, ry, 0);
    }

    static void Plant(Vector3 pos, Material pot, Material leaves)
    {
        Prim(PrimitiveType.Cylinder, "PlantPot", pos + Vector3.up * 0.25f, new Vector3(0.35f, 0.25f, 0.35f), pot);
        Prim(PrimitiveType.Sphere, "PlantLeaves", pos + Vector3.up * 0.95f, new Vector3(0.75f, 1f, 0.75f), leaves);
    }

    static void Label(string text, Vector3 pos, float size = 0.25f)
    {
        var g = new GameObject("Sign_" + text); g.transform.position = pos;
        var tm = g.AddComponent<TextMesh>(); var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        tm.font = font; g.GetComponent<MeshRenderer>().sharedMaterial = font.material;
        tm.text = text; tm.fontSize = 64; tm.characterSize = size; tm.anchor = TextAnchor.MiddleCenter;
    }

    static void ZoneShell(string name, float x, Color floorColor, Color wallColor)
    {
        var floor = Mat(name.Replace(" ", "") + "Floor", floorColor, 0.05f, 0.35f);
        var wall = Mat(name.Replace(" ", "") + "Wall", wallColor, 0.05f, 0.3f);
        Prim(PrimitiveType.Cube, name + " Floor", new Vector3(x, -0.1f, 0), new Vector3(50, 0.2f, 50), floor);
        Wall(name + " North Wall", new Vector3(x, 3, 24.5f), new Vector3(50, 6, 1), wall);
        Wall(name + " South Wall", new Vector3(x, 3, -24.5f), new Vector3(50, 6, 1), wall);
        Wall(name + " West Wall", new Vector3(x - 24.5f, 3, 0), new Vector3(1, 6, 50), wall);
        Wall(name + " East Wall", new Vector3(x + 24.5f, 3, 0), new Vector3(1, 6, 50), wall);
        Label(name.ToUpper(), new Vector3(x, 4.6f, 21.5f), 0.20f);
        for (int i = -1; i <= 1; i++)
        {
            var l = new GameObject(name + " CeilingLight" + i).AddComponent<Light>();
            l.type = LightType.Point; l.range = 14f; l.intensity = 7f; l.transform.position = new Vector3(x + i * 14f, 5.3f, 0);
        }
    }

    [MenuItem("Necpra/Build Main Scene")]
    public static void Build()
    {
        mats.Clear();
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        var sun = new GameObject("Sun").AddComponent<Light>();
        sun.type = LightType.Directional; sun.intensity = 1.0f; sun.transform.rotation = Quaternion.Euler(48, -28, 0);

        var camGo = new GameObject("Main Camera"); camGo.tag = "MainCamera";
        var cam = camGo.AddComponent<Camera>(); camGo.AddComponent<AudioListener>();
        cam.transform.position = new Vector3(0, 6.5f, -8f); cam.transform.LookAt(Vector3.up * 1.25f);
        cam.fieldOfView = 62f; cam.backgroundColor = new Color(0.045f, 0.055f, 0.075f); cam.clearFlags = CameraClearFlags.SolidColor;

        ZoneShell("Lobby", 0f, new Color(0.62f, 0.54f, 0.42f), new Color(0.16f, 0.13f, 0.10f));
        ZoneShell("Restaurant", 60f, new Color(0.42f, 0.20f, 0.16f), new Color(0.14f, 0.08f, 0.06f));
        ZoneShell("Game Hall", 120f, new Color(0.10f, 0.20f, 0.28f), new Color(0.055f, 0.09f, 0.13f));

        var wood = Mat("Wood", new Color(0.30f, 0.17f, 0.09f), 0.05f, 0.45f);
        var gold = Mat("Gold", new Color(0.70f, 0.48f, 0.10f), 0.75f, 0.75f);
        var green = Mat("Plant", new Color(0.12f, 0.30f, 0.16f));
        var ceramic = Mat("Ceramic", new Color(0.82f, 0.82f, 0.78f), 0f, 0.55f);
        var felt = Mat("Felt", new Color(0.055f, 0.25f, 0.16f), 0.05f, 0.25f);

        Prim(PrimitiveType.Cube, "Reception Desk", new Vector3(0, 0.75f, 13), new Vector3(10, 1.5f, 1.8f), wood);
        Prim(PrimitiveType.Cube, "Reception Counter", new Vector3(0, 1.55f, 12.55f), new Vector3(10, 0.18f, 1.5f), gold);
        for (int i = -2; i <= 2; i++) Chair(new Vector3(i * 2.4f, 0.45f, 6.5f), 180, ceramic);
        Prim(PrimitiveType.Cube, "LobbyCoffeeTable", new Vector3(0, 0.45f, 2.5f), new Vector3(4.5f, 0.35f, 2.2f), wood);
        Plant(new Vector3(-19, 0, 17), ceramic, green); Plant(new Vector3(19, 0, 17), ceramic, green);
        Label("NECPRA HOTEL", new Vector3(0, 3.2f, 12), 0.35f);

        Prim(PrimitiveType.Cube, "Restaurant Service Counter", new Vector3(60, 0.8f, 17), new Vector3(16, 1.6f, 1.8f), wood);
        for (int row = -1; row <= 1; row++)
        for (int col = -2; col <= 2; col++)
        {
            Vector3 p = new Vector3(60 + col * 7f, 0.45f, row * 8f);
            Prim(PrimitiveType.Cylinder, "Dining Table", p + Vector3.up * 0.25f, new Vector3(2, 0.25f, 2), wood);
            for (int s = 0; s < 4; s++)
            {
                float a = s * 90f; Vector3 cp = p + Quaternion.Euler(0, a, 0) * new Vector3(0, 0, 2.1f);
                Chair(cp, a + 180f, ceramic);
            }
        }
        Plant(new Vector3(40, 0, 19), ceramic, green); Plant(new Vector3(80, 0, 19), ceramic, green);

        for (int i = 0; i < 4; i++)
        {
            float x = 105f + (i % 2) * 30f, z = -13f + (i / 2) * 26f;
            Prim(PrimitiveType.Cylinder, "Game Station " + i, new Vector3(x, 0.45f, z), new Vector3(3.2f, 0.45f, 3.2f), felt);
            Label("PLAY", new Vector3(x, 1.0f, z + 3.4f), 0.12f);
        }

        Prim(PrimitiveType.Cylinder, "Tube Table", new Vector3(120, 0.45f, 0), new Vector3(4.6f, 0.45f, 4.6f), felt);
        var rim = Prim(PrimitiveType.Cylinder, "Tube Table Rim", new Vector3(120, 0.94f, 0), new Vector3(4.85f, 0.08f, 4.85f), gold);
        rim.GetComponent<Collider>().enabled = false;

        var rig = new GameObject("TubeRig").transform;
        var slots = new Transform[3]; var tubes = new Tube[3];
        var tubeMat = Mat("Tube", new Color(0.72f, 0.12f, 0.16f), 0.1f, 0.6f);
        for (int i = 0; i < 3; i++)
        {
            Vector3 p = new Vector3(118.8f + i * 1.2f, 1.2f, 0);
            slots[i] = Point("Slot" + i, p, rig);
            var t = Prim(PrimitiveType.Cylinder, "Tube" + i, p, new Vector3(0.7f, 0.3f, 0.7f), tubeMat, rig);
            tubes[i] = t.AddComponent<Tube>(); tubes[i].Slot = i;
        }

        var ball = Prim(PrimitiveType.Sphere, "Ball", new Vector3(120, 1.0f, 0), Vector3.one * 0.3f, gold, rig);
        Object.DestroyImmediate(ball.GetComponent<Collider>()); ball.SetActive(false);

        var seats = new[] { new Vector3(116.6f, 0, 1.4f), new Vector3(123.4f, 0, 1.4f), new Vector3(118.2f, 0, 3.8f), new Vector3(121.8f, 0, 3.8f) };
        var seatT = new Transform[4]; for (int i = 0; i < 4; i++) seatT[i] = Point("Seat" + i, seats[i], rig);
        var tableCam = Point("TableCam", new Vector3(120, 4.8f, -6.8f), rig); tableCam.LookAt(new Vector3(120, 1.0f, 0.6f));
        var closeCam = Point("CloseCam", new Vector3(120, 2.65f, -2.9f), rig); closeCam.LookAt(new Vector3(120, 1.15f, 0));

        var player = new GameObject("LocalPlayer"); var lp = player.AddComponent<LocalPlayer>(); lp.cam = cam;
        var sys = new GameObject("Systems");
        var world = sys.AddComponent<WorldClient>(); var tt = sys.AddComponent<TubeTable>();
        var ui = sys.AddComponent<GameUI>(); var boot = sys.AddComponent<GameBootstrap>();
        var director = sys.AddComponent<NecpraWorldDirector>();
        var npcs = sys.AddComponent<HotelNpcDirector>();
        var cinematic = sys.AddComponent<NecpraCinematicCamera>();
        var graphics = sys.AddComponent<NecpraGraphicsSettings>();
        var audio = sys.AddComponent<NecpraAudioDirector>();
        var games = sys.AddComponent<NecpraMiniGameCatalog>();
        var miniGameRuntime = sys.AddComponent<NecpraMiniGameRuntime>();
        cinematic.targetCamera = cam; cinematic.lobby = Point("WideCamera", new Vector3(0, 7.5f, -16f), sys.transform);
        cinematic.table = tableCam; cinematic.close = closeCam;

        world.player = lp; lp.table = tt;
        tt.tubes = tubes; tt.slotPoints = slots; tt.ball = ball.transform; tt.seats = seatT;
        tt.tableCam = tableCam; tt.closeCam = closeCam; tt.cam = cam; tt.world = world;
        ui.boot = boot; ui.world = world; ui.table = tt;
        boot.player = lp; boot.world = world; boot.table = tt; boot.ui = ui;

        if (!AssetDatabase.IsValidFolder("Assets/Scenes")) AssetDatabase.CreateFolder("Assets", "Scenes");
        EditorSceneManager.SaveScene(scene, "Assets/Scenes/Main.unity");
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene("Assets/Scenes/Main.unity", true) };
        AssetDatabase.SaveAssets();
        Debug.Log("Necpra: professional vertical-slice scene built.");
    }
}
#endif