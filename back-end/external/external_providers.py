from abc import ABC, abstractmethod
from models.healthkit import HealthKitRecord

class HealthKitDataProvider(ABC):
    @abstractmethod
    def poll(self, user_id: str) -> list[HealthKitRecord]:
        pass

    @abstractmethod
    def IsConnected(self) -> bool:
        pass


import os
import pathlib as Path
import xml.etree.ElementTree as ET
# Simple File System based provider for the health kit data
class DemoHealthKitDataProvider(HealthKitDataProvider):
    def __init__(self, source_dir):
        self.source_dir = source_dir

    def poll(self, user_id: str):
        ret = []     
        if self.source_dir != "" and self.source_dir is not None:
            file_source = f"{self.source_dir}/{user_id}.xml"
            tree = ET.parse(file_source)
            root = tree.getroot()
            for elem in root.findall("Record"):
                try:
                    record_xml = ET.tostring(elem, encoding="unicode")
                    record = HealthKitRecord.from_xml(record_xml)
                    ret.append(record)
                except Exception as e:
                    #print(f"failed to parse line: {record_xml} : {e}")
                    pass
        return ret
    
    def IsConnected(self):
        return True #For the demo provider, just always show connected