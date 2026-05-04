from pathlib import Path
import subprocess
import threading

from kivy.app import App
from kivy.clock import Clock
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.uix.popup import Popup
from kivy.uix.filechooser import FileChooserIconView
from kivy.uix.progressbar import ProgressBar


class FolderChooser(Popup):
    def __init__(self, on_select, title="Choose folder"):
        self.on_select = on_select
        layout = BoxLayout(orientation='vertical')
        self.filechooser = FileChooserIconView(path='.', filters=['*/'], dirselect=True)
        layout.add_widget(self.filechooser)

        btn_layout = BoxLayout(size_hint_y=0.2)
        btn_layout.add_widget(Button(text="Cancel", on_press=self.dismiss))
        btn_layout.add_widget(Button(text="Select", on_press=self.select))
        layout.add_widget(btn_layout)

        super().__init__(title=title, content=layout, size_hint=(0.9, 0.9))

    def select(self, instance):
        selection = self.filechooser.selection
        if selection:
            self.dismiss()
            self.on_select(selection[0])


class VTFConverter(BoxLayout):
    def __init__(self, **kwargs):
        super().__init__(orientation="vertical", spacing=10, padding=10, **kwargs)

        self.input_label = Label(text="Input folder: Not selected", size_hint_y=None, height=40)
        self.output_label = Label(text="Output folder: Not selected", size_hint_y=None, height=40)

        self.add_widget(self.input_label)
        self.add_widget(Button(text="Select Input Folder", on_press=self.select_input_folder))

        self.add_widget(self.output_label)
        self.add_widget(Button(text="Select Output Folder", on_press=self.select_output_folder))

        self.progress_label = Label(text="Progress: 0 / 0", size_hint_y=None, height=30)
        self.current_file_label = Label(text="Current file: None", size_hint_y=None, height=30)
        self.progress_bar = ProgressBar(max=100, value=0, size_hint_y=None, height=20)

        self.add_widget(self.progress_label)
        self.add_widget(self.current_file_label)
        self.add_widget(self.progress_bar)

        self.convert_button = Button(text="Convert", on_press=self.start_conversion, size_hint_y=None, height=50)
        self.add_widget(self.convert_button)

        self.input_dir = None
        self.output_dir = None

    def select_input_folder(self, instance):
        FolderChooser(self.set_input_dir, title="Select VTF Input Folder").open()

    def select_output_folder(self, instance):
        FolderChooser(self.set_output_dir, title="Select PNG Output Folder").open()

    def set_input_dir(self, path):
        self.input_dir = path
        self.input_label.text = f"Input folder: {path}"

    def set_output_dir(self, path):
        self.output_dir = path
        self.output_label.text = f"Output folder: {path}"

    def start_conversion(self, instance):
        if not self.input_dir or not self.output_dir:
            self.show_popup("Please select both input and output folders.")
            return

        thread = threading.Thread(target=self.convert_files)
        thread.start()

    def convert_files(self):
        vtf2png = Path(__file__).resolve().parent / "libs/vtf2png/vtf2png"
        if not vtf2png.is_file():
            Clock.schedule_once(lambda dt: self.show_popup("vtf2png binary not found."))
            return

        input_dir = Path(self.input_dir)
        output_dir = Path(self.output_dir)
        vtf_files = list(input_dir.glob("*.vtf"))

        if not vtf_files:
            Clock.schedule_once(lambda dt: self.show_popup("No .vtf files found in input folder."))
            return

        output_dir.mkdir(parents=True, exist_ok=True)

        Clock.schedule_once(lambda dt: self.set_progress_max(len(vtf_files)))

        for i, vtf_file in enumerate(vtf_files, start=1):
            output_file = output_dir / (vtf_file.stem + ".png")
            Clock.schedule_once(lambda dt, i=i, f=vtf_file: self.update_progress(i, len(vtf_files), f.name))

            try:
                subprocess.run([str(vtf2png), str(vtf_file), str(output_file)], check=True)
            except subprocess.CalledProcessError:
                Clock.schedule_once(lambda dt, f=vtf_file: self.show_popup(f"Error converting: {f.name}"))
                return

        Clock.schedule_once(lambda dt: self.update_done())

    def set_progress_max(self, total):
        self.progress_bar.max = total
        self.progress_bar.value = 0
        self.progress_label.text = f"Progress: 0 / {total}"
        self.current_file_label.text = "Current file: None"

    def update_progress(self, current, total, filename):
        self.progress_bar.value = current
        self.progress_label.text = f"Progress: {current} / {total}"
        self.current_file_label.text = f"Current file: {filename}"

    def update_done(self):
        self.current_file_label.text = "Current file: Done"
        self.show_popup("✅ Conversion complete!")

    def show_popup(self, message):
        popup = Popup(title="Status", content=Label(text=message), size_hint=(0.7, 0.3))
        popup.open()


class VTFApp(App):
    def build(self):
        return VTFConverter()


if __name__ == "__main__":
    VTFApp().run()
