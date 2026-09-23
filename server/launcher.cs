using System;
using System.Diagnostics;
using System.IO;

class Program
{
    static void Main(string[] args)
    {
        string serverDir = AppDomain.CurrentDomain.BaseDirectory;
        string nodePath = Path.Combine(serverDir, "node.exe");
        string bundlePath = Path.Combine(serverDir, "dist", "bundle.js");

        // Klasör yolları
        string parentSharedDir = Path.GetFullPath(Path.Combine(serverDir, "..", "shared"));
        string localSharedDir = Path.Combine(serverDir, "shared");

        try
        {
            // Eğer server\shared yoksa ama üstte varsa, üsttekinden kopyalayalım veya oluşturalım
            Directory.CreateDirectory(localSharedDir);

            if (Directory.Exists(parentSharedDir))
            {
                foreach (string file in Directory.GetFiles(parentSharedDir))
                {
                    string destFile = Path.Combine(localSharedDir, Path.GetFileName(file));
                    File.Copy(file, destFile, true); // Üzerine yazarak senkronize et
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("[UYARI] Dosya senkronizasyon uyarisi: " + ex.Message);
        }

        if (!File.Exists(nodePath))
        {
            nodePath = "node";
        }

        if (!File.Exists(bundlePath))
        {
            Console.WriteLine("[HATA] dist/bundle.js bulunamadi!");
            Console.ReadLine();
            return;
        }

        ProcessStartInfo startInfo = new ProcessStartInfo
        {
            FileName = nodePath,
            Arguments = "\"" + bundlePath + "\"",
            UseShellExecute = false,
            WorkingDirectory = serverDir
        };

        try
        {
            using (Process process = Process.Start(startInfo))
            {
                process.WaitForExit();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("[HATA] Sunucu baslatilamadi: " + ex.Message);
            Console.ReadLine();
        }
    }
}