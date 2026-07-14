{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [ pkgs.nodejs pkgs.electron ];
          # Use the NixOS-patched Electron instead of the pre-built npm binary.
          # pkgs.electron has correct RPATHs baked in, supports native Wayland
          # (ozone/Chromium), and needs no LD_LIBRARY_PATH workarounds.
          # electron-vite reads ELECTRON_EXEC_PATH before falling back to
          # node_modules/electron/dist/electron.
          ELECTRON_EXEC_PATH = "${pkgs.electron}/bin/electron";
          # Tag audio streams so WirePlumber ducks Multimedia while the VTuber
          # speaks (role-based ducking policy: nixos modules/features/audio.nix)
          PULSE_PROP_OVERRIDE = "media.role=Assistant";
        };
      });
    };
}
